import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createJournalEntry } from '@/lib/journal-entries';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionIds } = await request.json();
  if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0) {
    return NextResponse.json({ data: null, error: 'bankTransactionIds required' }, { status: 400 });
  }

  // Load transactions with their matched items
  const txns = await prisma.bankTransaction.findMany({
    where: { id: { in: bankTransactionIds }, recon_status: 'matched' },
    include: {
      bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } },
    },
  });

  if (txns.length === 0) {
    return NextResponse.json({ data: null, error: 'No suggested matches found to confirm.' }, { status: 400 });
  }

  // Verify firm access
  for (const txn of txns) {
    if (firmIds && !firmIds.includes(txn.bankStatement.firm_id)) {
      return NextResponse.json({ data: null, error: 'Access denied' }, { status: 403 });
    }
  }

  // Find claims matched to these transactions (many claims → one txn)
  const txnIds = txns.map(t => t.id);
  const matchedClaims = await prisma.claim.findMany({
    where: { matched_bank_txn_id: { in: txnIds } },
    select: { id: true, amount: true, merchant: true, category_id: true, gl_account_id: true, matched_bank_txn_id: true,
      employee: { select: { name: true } }, category: { select: { name: true } } },
  });
  // Group claims by their matched bank txn
  const claimsByTxnId = new Map<string, typeof matchedClaims>();
  for (const claim of matchedClaims) {
    const list = claimsByTxnId.get(claim.matched_bank_txn_id!) ?? [];
    list.push(claim);
    claimsByTxnId.set(claim.matched_bank_txn_id!, list);
  }

  // Pre-fetch invoice allocations for these transactions
  const invoiceAllocations = await prisma.bankTransactionInvoice.findMany({
    where: { bank_transaction_id: { in: txnIds } },
    select: { bank_transaction_id: true, invoice_id: true, amount: true },
  });
  const allocationsByTxnId = new Map<string, typeof invoiceAllocations>();
  for (const alloc of invoiceAllocations) {
    const list = allocationsByTxnId.get(alloc.bank_transaction_id) ?? [];
    list.push(alloc);
    allocationsByTxnId.set(alloc.bank_transaction_id, list);
  }

  // Validate — each txn must have a matched item
  const errors: string[] = [];
  for (const txn of txns) {
    const hasClaims = claimsByTxnId.has(txn.id);
    const hasInvoiceAllocs = allocationsByTxnId.has(txn.id);
    if (!hasInvoiceAllocs && !txn.matched_sales_invoice_id && !hasClaims && !txn.matched_payment_id) {
      errors.push(`Transaction ${txn.description} has no matched payment.`);
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ data: null, error: errors.join('\n') }, { status: 400 });
  }

  // ─── Batch pre-fetch all related data ────────────────────────────────
  const invoiceIds = Array.from(new Set(invoiceAllocations.map(a => a.invoice_id)));
  const salesInvoiceIds = txns.map(t => t.matched_sales_invoice_id).filter(Boolean) as string[];
  const uniqueFirmIds = Array.from(new Set(txns.map(t => t.bankStatement.firm_id)));

  // Build unique bank account keys
  const bankAccountKeys = Array.from(new Map(txns.map(t => {
    const key = `${t.bankStatement.firm_id}|${t.bankStatement.bank_name}|${t.bankStatement.account_number ?? ''}`;
    return [key, { firm_id: t.bankStatement.firm_id, bank_name: t.bankStatement.bank_name, account_number: t.bankStatement.account_number ?? '' }] as const;
  })).values());

  const [invoices, salesInvoices, firms, bankAccounts] = await Promise.all([
    invoiceIds.length > 0
      ? prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, total_amount: true, amount_paid: true, vendor_name_raw: true,
            supplier: { select: { default_contra_gl_account_id: true } } },
        })
      : [],
    salesInvoiceIds.length > 0
      ? prisma.salesInvoice.findMany({
          where: { id: { in: salesInvoiceIds } },
          select: { id: true, total_amount: true, amount_paid: true, buyer: { select: { name: true } } },
        })
      : [],
    prisma.firm.findMany({
      where: { id: { in: uniqueFirmIds } },
      select: { id: true, default_trade_payables_gl_id: true, default_trade_receivables_gl_id: true },
    }),
    Promise.all(bankAccountKeys.map(k =>
      prisma.bankAccount.findUnique({
        where: { firm_id_bank_name_account_number: k },
        select: { gl_account_id: true, firm_id: true, bank_name: true, account_number: true },
      })
    )),
  ]);

  // Build lookup maps
  const invoiceMap = new Map(invoices.map(i => [i.id, i]));
  const salesInvoiceMap = new Map(salesInvoices.map(s => [s.id, s]));
  const firmMap = new Map(firms.map(f => [f.id, f]));
  const bankGlMap = new Map(bankAccounts.filter(Boolean).map(b => [`${b!.firm_id}|${b!.bank_name}|${b!.account_number}`, b!.gl_account_id]));

  // Pre-fetch category overrides for claims that need them
  const claimsNeedingOverride = matchedClaims.filter(c => !c.gl_account_id && c.category_id);
  const categoryOverrides = claimsNeedingOverride.length > 0
    ? await prisma.categoryFirmOverride.findMany({
        where: {
          OR: claimsNeedingOverride.map(c => ({
            category_id: c.category_id!,
            firm_id: { in: uniqueFirmIds },
          })),
        },
        select: { category_id: true, firm_id: true, gl_account_id: true },
      })
    : [];
  const catOverrideMap = new Map(categoryOverrides.map(o => [`${o.category_id}|${o.firm_id}`, o.gl_account_id]));

  // ─── Process each transaction using pre-fetched data ───────────────
  let confirmed = 0;
  for (const txn of txns) {
    const firmId = txn.bankStatement.firm_id;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);
    const bankKey = `${firmId}|${txn.bankStatement.bank_name}|${txn.bankStatement.account_number ?? ''}`;

    const bankGlId = bankGlMap.get(bankKey);
    if (!bankGlId) {
      errors.push(`Bank account ${txn.bankStatement.bank_name} has no GL mapping.`);
      continue;
    }

    // ─── Confirm supplier invoice match(es) via BankTransactionInvoice ───
    const txnAllocations = allocationsByTxnId.get(txn.id);
    if (txnAllocations && txnAllocations.length > 0) {
      const jvLines: { glAccountId: string; debitAmount: number; creditAmount: number; description: string }[] = [];
      let invoiceGlError = false;
      let totalAllocated = 0;
      const invoiceDescs: string[] = [];

      for (const alloc of txnAllocations) {
        const invoice = invoiceMap.get(alloc.invoice_id);
        if (!invoice) continue;

        const firm = firmMap.get(firmId);
        const contraGlId = invoice.supplier?.default_contra_gl_account_id || firm?.default_trade_payables_gl_id;
        if (!contraGlId) { errors.push(`No Trade Payables GL for ${invoice.vendor_name_raw}`); invoiceGlError = true; break; }

        const allocAmount = Number(alloc.amount);
        totalAllocated += allocAmount;
        invoiceDescs.push(invoice.vendor_name_raw ?? 'Supplier');

        jvLines.push({ glAccountId: contraGlId, debitAmount: allocAmount, creditAmount: 0, description: `Trade Payables — ${invoice.vendor_name_raw}` });
      }

      if (invoiceGlError) continue;

      jvLines.push({ glAccountId: bankGlId, debitAmount: 0, creditAmount: totalAllocated, description: txn.bankStatement.bank_name });

      const description = txnAllocations.length === 1
        ? `Bank recon — ${invoiceDescs[0]}`
        : `Bank recon — ${txnAllocations.length} invoices (${invoiceDescs.join(', ')})`.slice(0, 255);

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: jvLines,
        createdBy: session.user.id,
      });

      // Recalculate payment for each invoice
      for (const alloc of txnAllocations) {
        await recalcInvoicePaid(alloc.invoice_id);
      }
    }

    // ─── Confirm sales invoice match ─────────────────────────────────────
    if (txn.matched_sales_invoice_id) {
      const salesInvoice = salesInvoiceMap.get(txn.matched_sales_invoice_id);
      if (!salesInvoice) continue;

      const firm = firmMap.get(firmId);
      const receivablesGlId = firm?.default_trade_receivables_gl_id;
      if (!receivablesGlId) { errors.push('No Trade Receivables GL configured'); continue; }

      const newPaid = Number(salesInvoice.amount_paid) + txnAmount;
      await prisma.salesInvoice.update({
        where: { id: salesInvoice.id },
        data: { amount_paid: newPaid, payment_status: newPaid >= Number(salesInvoice.total_amount) ? 'paid' : 'partially_paid' },
      });

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${salesInvoice.buyer?.name ?? 'Customer'}`,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: [
          { glAccountId: bankGlId, debitAmount: txnAmount, creditAmount: 0, description: txn.bankStatement.bank_name },
          { glAccountId: receivablesGlId, debitAmount: 0, creditAmount: txnAmount, description: 'Trade Receivables' },
        ],
        createdBy: session.user.id,
      });
    }

    // ─── Confirm claim match (many claims → one txn) ──────────────────────
    const txnClaims = claimsByTxnId.get(txn.id);
    if (txnClaims && txnClaims.length > 0) {
      // Resolve GL for each claim
      const expenseLines: { glAccountId: string; debitAmount: number; creditAmount: number; description: string }[] = [];
      let claimGlError = false;
      for (const claim of txnClaims) {
        let expenseGlId = claim.gl_account_id;
        if (!expenseGlId && claim.category_id) {
          expenseGlId = catOverrideMap.get(`${claim.category_id}|${firmId}`) ?? null;
        }
        if (!expenseGlId) {
          errors.push(`No GL for claim: ${claim.merchant}`);
          claimGlError = true;
          break;
        }
        expenseLines.push({
          glAccountId: expenseGlId,
          debitAmount: Number(claim.amount),
          creditAmount: 0,
          description: `${claim.category?.name} — ${claim.merchant}`,
        });
      }
      if (claimGlError) continue;

      // Mark all matched claims as paid
      await prisma.claim.updateMany({
        where: { id: { in: txnClaims.map(c => c.id) } },
        data: { payment_status: 'paid' },
      });

      // Build description from all claims
      const claimEmployees = Array.from(new Set(txnClaims.map(c => c.employee?.name).filter(Boolean)));
      const description = txnClaims.length === 1
        ? `${txnClaims[0].category?.name} — ${txnClaims[0].merchant} (${txnClaims[0].employee?.name})`
        : `${txnClaims.length} claims (${claimEmployees.join(', ')})`;

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${description}`,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: [
          ...expenseLines,
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: txnAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });
    }

    // ─── Legacy: confirm old Payment-based match ─────────────────────────
    if (txn.matched_payment_id && (!txnAllocations || txnAllocations.length === 0) && !txn.matched_sales_invoice_id && (!txnClaims || txnClaims.length === 0)) {
      const { createBankReconJV } = await import('@/lib/bank-recon-jv');
      await createBankReconJV(txn.id, txn.matched_payment_id, firmId, session.user.id);
    }

    // Mark as confirmed
    await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: { recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
    });
    confirmed++;
  }

  if (errors.length > 0) {
    return NextResponse.json({ data: { confirmed }, error: errors.join('\n') }, { status: confirmed > 0 ? 200 : 400 });
  }

  return NextResponse.json({ data: { confirmed }, error: null });
}
