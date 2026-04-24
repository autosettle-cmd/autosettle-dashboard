import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id } = await params;

  // Flat query: load statement + transactions without deep nesting
  const statement = await prisma.bankStatement.findUnique({
    where: { id },
    include: {
      transactions: {
        select: {
          id: true, transaction_date: true, description: true, reference: true,
          cheque_number: true, debit: true, credit: true, balance: true,
          recon_status: true, matched_at: true, notes: true,
          matched_payment_id: true, matched_sales_invoice_id: true,
        },
        orderBy: [{ transaction_date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!statement || (firmIds && !firmIds.includes(statement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
  }

  const txnIds = statement.transactions.map(t => t.id);
  const paymentIds = statement.transactions.filter(t => t.matched_payment_id).map(t => t.matched_payment_id!);
  const salesInvIds = statement.transactions.filter(t => t.matched_sales_invoice_id).map(t => t.matched_sales_invoice_id!);

  // Batch-load all related data in parallel
  const [invoiceAllocs, claimLinks, payments, salesInvoices] = await Promise.all([
    // Invoice allocations for all transactions
    prisma.bankTransactionInvoice.findMany({
      where: { bank_transaction_id: { in: txnIds } },
      select: {
        bank_transaction_id: true, amount: true,
        invoice: { select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, amount_paid: true, issue_date: true, file_url: true, thumbnail_url: true, gl_account_id: true, contra_gl_account_id: true, supplier: { select: { default_gl_account_id: true, default_contra_gl_account_id: true } } } },
      },
    }),
    // Claim links for all transactions
    prisma.claim.findMany({
      where: { matched_bank_txn_id: { in: txnIds } },
      select: { id: true, matched_bank_txn_id: true, merchant: true, amount: true, claim_date: true, receipt_number: true, file_url: true, thumbnail_url: true, employee: { select: { id: true, name: true } }, category: { select: { name: true } } },
    }),
    // Payments (only for transactions that have them)
    paymentIds.length > 0 ? prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      select: {
        id: true, reference: true, payment_date: true, amount: true, direction: true, notes: true,
        supplier: { select: { name: true } }, employee: { select: { name: true } },
        allocations: { select: { invoice_id: true, amount: true, invoice: { select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, issue_date: true, file_url: true } } } },
        receipts: { select: { claim: { select: { id: true, merchant: true, receipt_number: true, amount: true, claim_date: true, thumbnail_url: true, file_url: true, gl_account_id: true, glAccount: { select: { account_code: true, name: true } }, contra_gl_account_id: true, contraGlAccount: { select: { account_code: true, name: true } } } } } },
      },
    }) : [],
    // Sales invoices (only for transactions that have them)
    salesInvIds.length > 0 ? prisma.salesInvoice.findMany({
      where: { id: { in: salesInvIds } },
      select: { id: true, invoice_number: true, total_amount: true, amount_paid: true, issue_date: true, buyer: { select: { name: true } } },
    }) : [],
  ]);

  // Build lookup maps
  const allocsByTxn = new Map<string, typeof invoiceAllocs>();
  for (const a of invoiceAllocs) {
    const arr = allocsByTxn.get(a.bank_transaction_id) ?? [];
    arr.push(a);
    allocsByTxn.set(a.bank_transaction_id, arr);
  }
  const claimsByTxn = new Map<string, typeof claimLinks>();
  for (const c of claimLinks) {
    if (!c.matched_bank_txn_id) continue;
    const arr = claimsByTxn.get(c.matched_bank_txn_id) ?? [];
    arr.push(c);
    claimsByTxn.set(c.matched_bank_txn_id, arr);
  }
  const paymentMap = new Map(payments.map(p => [p.id, p]));
  const salesInvMap = new Map(salesInvoices.map(s => [s.id, s]));

  // Fetch bank account GL mapping
  const bankAccountMapping = await prisma.bankAccount.findUnique({
    where: {
      firm_id_bank_name_account_number: {
        firm_id: statement.firm_id,
        bank_name: statement.bank_name,
        account_number: statement.account_number ?? '',
      },
    },
    include: { glAccount: { select: { account_code: true, name: true } } },
  });
  const bankGlLabel = bankAccountMapping?.glAccount
    ? `${bankAccountMapping.glAccount.account_code} — ${bankAccountMapping.glAccount.name}`
    : null;

  let systemDebit = 0, systemCredit = 0;
  for (const txn of statement.transactions) {
    if (txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') {
      if (txn.debit) systemDebit += Number(txn.debit);
      if (txn.credit) systemCredit += Number(txn.credit);
    }
  }

  const matched = statement.transactions.filter((t) => t.recon_status === 'matched' || t.recon_status === 'manually_matched').length;
  const unmatched = statement.transactions.filter((t) => t.recon_status === 'unmatched').length;
  const excluded = statement.transactions.filter((t) => t.recon_status === 'excluded').length;

  // Resolve pending claims from Payment notes
  const pendingClaimIds: string[] = [];
  for (const t of statement.transactions) {
    const pmt = t.matched_payment_id ? paymentMap.get(t.matched_payment_id) : null;
    if (pmt && pmt.receipts.length === 0) {
      const match = pmt.notes?.match(/\[claim:([^\]]+)\]/);
      if (match) pendingClaimIds.push(match[1]);
    }
  }
  const pendingClaims = pendingClaimIds.length > 0
    ? await prisma.claim.findMany({
        where: { id: { in: pendingClaimIds } },
        select: { id: true, merchant: true, receipt_number: true, amount: true, claim_date: true, thumbnail_url: true, file_url: true, gl_account_id: true, glAccount: { select: { account_code: true, name: true } }, contra_gl_account_id: true, contraGlAccount: { select: { account_code: true, name: true } } },
      })
    : [];
  const pendingClaimMap = new Map(pendingClaims.map((c) => [c.id, c]));

  return NextResponse.json({
    data: {
      id: statement.id, firm_id: statement.firm_id, bank_name: statement.bank_name, account_number: statement.account_number, bank_gl_label: bankGlLabel,
      statement_date: statement.statement_date, opening_balance: statement.opening_balance?.toString() ?? null,
      closing_balance: statement.closing_balance?.toString() ?? null, file_name: statement.file_name, file_url: statement.file_url,
      created_at: statement.created_at, balance_override: statement.balance_override,
      summary: { total: statement.transactions.length, matched, unmatched, excluded },
      system_balance: { debit: systemDebit, credit: systemCredit },
      transactions: statement.transactions.map((t) => {
        const allocs = allocsByTxn.get(t.id) ?? [];
        const claims = claimsByTxn.get(t.id) ?? [];
        const pmt = t.matched_payment_id ? paymentMap.get(t.matched_payment_id) ?? null : null;
        const salesInv = t.matched_sales_invoice_id ? salesInvMap.get(t.matched_sales_invoice_id) ?? null : null;

        // Resolve receipts from payment
        let receipts = pmt?.receipts.map((r) => ({
          id: r.claim.id, merchant: r.claim.merchant, receipt_number: r.claim.receipt_number,
          amount: r.claim.amount.toString(), claim_date: r.claim.claim_date, thumbnail_url: r.claim.thumbnail_url, file_url: r.claim.file_url,
          gl_label: r.claim.glAccount ? `${r.claim.glAccount.account_code} — ${r.claim.glAccount.name}` : null,
          contra_gl_label: r.claim.contraGlAccount ? `${r.claim.contraGlAccount.account_code} — ${r.claim.contraGlAccount.name}` : null,
        })) ?? [];

        if (receipts.length === 0 && pmt?.notes) {
          const claimMatch = pmt.notes.match(/\[claim:([^\]]+)\]/);
          if (claimMatch) {
            const claim = pendingClaimMap.get(claimMatch[1]);
            if (claim) {
              receipts = [{
                id: claim.id, merchant: claim.merchant, receipt_number: claim.receipt_number,
                amount: claim.amount.toString(), claim_date: claim.claim_date, thumbnail_url: claim.thumbnail_url, file_url: claim.file_url,
                gl_label: claim.glAccount ? `${claim.glAccount.account_code} — ${claim.glAccount.name}` : null,
                contra_gl_label: claim.contraGlAccount ? `${claim.contraGlAccount.account_code} — ${claim.contraGlAccount.name}` : null,
              }];
            }
          }
        }

        return {
          id: t.id, transaction_date: t.transaction_date, description: t.description, reference: t.reference,
          cheque_number: t.cheque_number, debit: t.debit?.toString() ?? null, credit: t.credit?.toString() ?? null,
          balance: t.balance?.toString() ?? null, recon_status: t.recon_status, matched_at: t.matched_at, notes: t.notes,
          matched_invoice: allocs.length > 0 ? {
            id: allocs[0].invoice.id, invoice_number: allocs[0].invoice.invoice_number, vendor_name: allocs[0].invoice.vendor_name_raw,
            total_amount: allocs[0].invoice.total_amount.toString(), amount_paid: allocs[0].invoice.amount_paid.toString(),
            issue_date: allocs[0].invoice.issue_date, file_url: allocs[0].invoice.file_url, thumbnail_url: allocs[0].invoice.thumbnail_url,
            allocation_amount: allocs[0].amount.toString(),
            contra_gl_account_id: allocs[0].invoice.contra_gl_account_id ?? allocs[0].invoice.supplier?.default_contra_gl_account_id ?? null,
            supplier_default_contra_gl_id: allocs[0].invoice.supplier?.default_contra_gl_account_id ?? null,
          } : null,
          matched_invoice_allocations: allocs.map(a => ({
            invoice_id: a.invoice.id, invoice_number: a.invoice.invoice_number, vendor_name: a.invoice.vendor_name_raw,
            total_amount: a.invoice.total_amount.toString(), amount_paid: a.invoice.amount_paid.toString(),
            issue_date: a.invoice.issue_date, file_url: a.invoice.file_url, thumbnail_url: a.invoice.thumbnail_url,
            allocation_amount: a.amount.toString(),
          })),
          matched_sales_invoice: salesInv ? {
            id: salesInv.id, invoice_number: salesInv.invoice_number,
            total_amount: salesInv.total_amount.toString(), amount_paid: salesInv.amount_paid.toString(),
            issue_date: salesInv.issue_date, buyer_name: salesInv.buyer?.name ?? 'Unknown',
          } : null,
          matched_claims: claims.map(c => ({
            id: c.id, merchant: c.merchant, amount: c.amount.toString(),
            claim_date: c.claim_date, receipt_number: c.receipt_number,
            file_url: c.file_url, thumbnail_url: c.thumbnail_url,
            employee_id: c.employee.id, employee_name: c.employee.name, category_name: c.category.name,
          })),
          matched_payment: pmt ? {
            id: pmt.id, reference: pmt.reference, payment_date: pmt.payment_date,
            amount: pmt.amount.toString(), direction: pmt.direction, notes: pmt.notes,
            supplier_name: pmt.supplier?.name ?? pmt.employee?.name ?? 'Unknown',
            allocations: pmt.allocations.map((a) => ({
              invoice_id: a.invoice_id, invoice_number: a.invoice.invoice_number, vendor_name: a.invoice.vendor_name_raw,
              total_amount: a.invoice.total_amount.toString(), issue_date: a.invoice.issue_date, allocated_amount: a.amount.toString(),
              file_url: a.invoice.file_url,
            })),
            receipts,
          } : null,
        };
      }),
    },
    error: null,
  });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
