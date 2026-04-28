import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createJournalEntry } from '@/lib/journal-entries';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

/**
 * Matches a bank transaction directly to an invoice, sales invoice, or claim.
 * No Payment record needed — direct FK link on BankTransaction.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { bankTransactionId, invoiceId, salesInvoiceId, claimId, claimIds, glAccountId } = body as {
    bankTransactionId: string;
    invoiceId?: string;
    salesInvoiceId?: string;
    claimId?: string;
    claimIds?: string[];
    glAccountId?: string;
  };
  // Normalize: claimIds takes priority, fall back to single claimId
  const resolvedClaimIds = claimIds ?? (claimId ? [claimId] : []);

  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId required' }, { status: 400 });
  }
  if (!invoiceId && !salesInvoiceId && resolvedClaimIds.length === 0) {
    return NextResponse.json({ data: null, error: 'Must provide invoiceId, salesInvoiceId, or claimIds' }, { status: 400 });
  }

  // Load bank transaction
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } } },
  });
  if (!txn) return NextResponse.json({ data: null, error: 'Bank transaction not found' }, { status: 404 });
  const isConfirmed = txn.recon_status === 'manually_matched';
  // Allow adding more invoices to confirmed transactions (multi-invoice allocation)
  if (isConfirmed && !invoiceId) {
    return NextResponse.json({ data: null, error: 'Transaction already confirmed. Can only add invoices.' }, { status: 400 });
  }

  const firmId = txn.bankStatement.firm_id;

  // Verify access
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Unauthorized for this firm' }, { status: 403 });
    }
  }

  // Get bank GL account
  const bankAccount = await prisma.bankAccount.findUnique({
    where: {
      firm_id_bank_name_account_number: {
        firm_id: firmId,
        bank_name: txn.bankStatement.bank_name,
        account_number: txn.bankStatement.account_number ?? '',
      },
    },
    select: { gl_account_id: true },
  });
  if (!bankAccount?.gl_account_id) {
    return NextResponse.json({ data: null, error: 'Bank account has no GL mapping. Assign a GL account to this bank account first.' }, { status: 400 });
  }
  const bankGlId = bankAccount.gl_account_id;

  const txnAmount = Number(txn.credit ?? txn.debit ?? 0);

  try {
    // ─── Match to Supplier Invoice (DEBIT / outgoing) ────────────────────
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, vendor_name_raw: true, gl_account_id: true,
          supplier: { select: { default_contra_gl_account_id: true } } },
      });
      if (!invoice || invoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
      }

      // Determine contra GL: supplier sub-account → firm default
      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_payables_gl_id: true } });
      const contraGlId = glAccountId || invoice.supplier?.default_contra_gl_account_id || firm?.default_trade_payables_gl_id;
      if (!contraGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Payables GL configured for this supplier.' }, { status: 400 });
      }

      // Calculate allocation amount — remaining unallocated for this txn, capped at invoice balance
      const existingAllocations = await prisma.bankTransactionInvoice.findMany({
        where: { bank_transaction_id: bankTransactionId },
        select: { amount: true },
      });
      const alreadyAllocated = existingAllocations.reduce((s, a) => s + Number(a.amount), 0);
      const invoiceBalance = Number(invoice.total_amount) - Number(invoice.amount_paid);
      const payAmount = Math.min(txnAmount - alreadyAllocated, invoiceBalance > 0 ? invoiceBalance : Number(invoice.total_amount));

      if (payAmount <= 0) {
        return NextResponse.json({ data: null, error: 'No remaining amount to allocate' }, { status: 400 });
      }

      // Link bank transaction to invoice via join table + update status
      await prisma.$transaction(async (tx) => {
        await tx.bankTransactionInvoice.create({
          data: {
            bank_transaction_id: bankTransactionId,
            invoice_id: invoiceId,
            amount: payAmount,
          },
        });
        if (!isConfirmed) {
          await tx.bankTransaction.update({
            where: { id: bankTransactionId },
            data: {
              recon_status: 'manually_matched',
              matched_at: new Date(),
              matched_by: session.user.id,
            },
          });
        }
      });

      await recalcInvoicePaid(invoiceId);

      // JV: DR Trade Payables / CR Bank
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${invoice.vendor_name_raw}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        voucherPrefix: 'PV',
        lines: [
          { glAccountId: contraGlId, debitAmount: payAmount, creditAmount: 0, description: 'Trade Payables' },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: payAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true, amount: payAmount }, error: null });
    }

    // ─── Match to Sales Invoice (CREDIT / incoming) ──────────────────────
    if (salesInvoiceId) {
      const salesInvoice = await prisma.invoice.findFirst({
        where: { id: salesInvoiceId, type: 'sales' },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, invoice_number: true,
          supplier: { select: { name: true } } },
      });
      if (!salesInvoice || salesInvoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
      }

      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_receivables_gl_id: true } });
      const receivablesGlId = glAccountId || firm?.default_trade_receivables_gl_id;
      if (!receivablesGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Receivables GL configured.' }, { status: 400 });
      }

      const payAmount = txnAmount;

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched_invoice_id: salesInvoiceId,
          recon_status: 'manually_matched',
          matched_at: new Date(),
          matched_by: session.user.id,
        },
      });

      const newPaid = Number(salesInvoice.amount_paid) + payAmount;
      const total = Number(salesInvoice.total_amount);
      await prisma.invoice.update({
        where: { id: salesInvoiceId },
        data: {
          amount_paid: newPaid,
          payment_status: newPaid >= total ? 'paid' : 'partially_paid',
        },
      });

      // JV: DR Bank / CR Trade Receivables
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${salesInvoice.supplier?.name ?? 'Customer'}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        voucherPrefix: 'OR',
        lines: [
          { glAccountId: bankGlId, debitAmount: payAmount, creditAmount: 0, description: txn.bankStatement.bank_name },
          { glAccountId: receivablesGlId, debitAmount: 0, creditAmount: payAmount, description: 'Trade Receivables' },
        ],
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true }, error: null });
    }

    // ─── Match to Employee Claims (DEBIT / outgoing) — supports multi-claim ──
    if (resolvedClaimIds.length > 0) {
      const claims = await prisma.claim.findMany({
        where: { id: { in: resolvedClaimIds } },
        select: {
          id: true, firm_id: true, amount: true, merchant: true, category_id: true, gl_account_id: true,
          employee: { select: { id: true, name: true } },
          category: { select: { name: true } },
        },
      });
      if (claims.length === 0 || claims.some(c => c.firm_id !== firmId)) {
        return NextResponse.json({ data: null, error: 'Claim not found or access denied' }, { status: 404 });
      }

      // Resolve GL for each claim + build JV lines
      const jvLines: { glAccountId: string; debitAmount: number; creditAmount: number; description: string }[] = [];
      let totalAmount = 0;
      const descriptions: string[] = [];

      for (const claim of claims) {
        let expenseGlId = glAccountId || claim.gl_account_id;
        if (!expenseGlId && claim.category_id) {
          const catOverride = await prisma.categoryFirmOverride.findUnique({
            where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
            select: { gl_account_id: true },
          });
          expenseGlId = catOverride?.gl_account_id ?? null;
        }
        if (!expenseGlId) {
          return NextResponse.json({ data: null, error: `No GL account for claim: ${claim.merchant}` }, { status: 400 });
        }

        const amt = Number(claim.amount);
        totalAmount += amt;
        jvLines.push({ glAccountId: expenseGlId, debitAmount: amt, creditAmount: 0, description: `${claim.category.name} — ${claim.merchant}` });
        descriptions.push(`${claim.merchant} (${claim.employee.name})`);

        // Save category GL mapping
        if (glAccountId && claim.category_id) {
          await prisma.categoryFirmOverride.upsert({
            where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
            update: { gl_account_id: glAccountId },
            create: { firm_id: firmId, category_id: claim.category_id, gl_account_id: glAccountId },
          });
        }
      }

      // Credit bank for total
      jvLines.push({ glAccountId: bankGlId, debitAmount: 0, creditAmount: totalAmount, description: txn.bankStatement.bank_name });

      // Check for double-payment — reject claims already linked to another bank txn
      const existingAllocs = await prisma.bankTransactionClaim.findMany({
        where: { claim_id: { in: resolvedClaimIds } },
        select: { claim_id: true },
      });
      if (existingAllocs.length > 0) {
        const dupeIds = existingAllocs.map(a => a.claim_id);
        const dupeNames = claims.filter(c => dupeIds.includes(c.id)).map(c => c.merchant);
        return NextResponse.json({ data: null, error: `Claims already matched: ${dupeNames.join(', ')}` }, { status: 400 });
      }

      // Update bank txn + create claim allocations via join table
      await prisma.$transaction([
        prisma.bankTransaction.update({
          where: { id: bankTransactionId },
          data: { recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
        }),
        ...claims.map(c => prisma.bankTransactionClaim.create({
          data: {
            bank_transaction_id: bankTransactionId,
            claim_id: c.id,
            amount: Number(c.amount),
          },
        })),
        ...claims.map(c => prisma.claim.update({
          where: { id: c.id },
          data: { matched_bank_txn_id: bankTransactionId, payment_status: 'paid' },
        })),
      ]);

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Reimbursement — ${descriptions.join(', ')}`.slice(0, 255),
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        voucherPrefix: 'CR',
        lines: jvLines,
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true, claimsMatched: claims.length }, error: null });
    }

    return NextResponse.json({ data: null, error: 'No match target provided' }, { status: 400 });
  } catch (err) {
    console.error('Match-item error:', err);
    return NextResponse.json({ data: null, error: `Match failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
