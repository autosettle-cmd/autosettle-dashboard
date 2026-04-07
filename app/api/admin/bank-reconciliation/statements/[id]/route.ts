import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const { id } = await params;

  const statement = await prisma.bankStatement.findUnique({
    where: { id },
    include: {
      transactions: {
        include: {
          matchedPayment: {
            select: {
              id: true,
              reference: true,
              payment_date: true,
              amount: true,
              direction: true,
              notes: true,
              supplier: { select: { name: true } },
              allocations: {
                include: { invoice: { select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, issue_date: true } } },
              },
              receipts: {
                select: { claim: { select: { id: true, merchant: true, receipt_number: true, amount: true, claim_date: true, thumbnail_url: true } } },
              },
            },
          },
        },
        orderBy: { transaction_date: 'asc' },
      },
    },
  });

  if (!statement || statement.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
  }

  // Calculate system balance from matched payments
  let systemDebit = 0;
  let systemCredit = 0;
  for (const txn of statement.transactions) {
    if (txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') {
      if (txn.debit) systemDebit += Number(txn.debit);
      if (txn.credit) systemCredit += Number(txn.credit);
    }
  }

  const matched = statement.transactions.filter((t) => t.recon_status === 'matched' || t.recon_status === 'manually_matched').length;
  const unmatched = statement.transactions.filter((t) => t.recon_status === 'unmatched').length;
  const excluded = statement.transactions.filter((t) => t.recon_status === 'excluded').length;

  return NextResponse.json({
    data: {
      id: statement.id,
      firm_id: statement.firm_id,
      bank_name: statement.bank_name,
      account_number: statement.account_number,
      statement_date: statement.statement_date,
      opening_balance: statement.opening_balance?.toString() ?? null,
      closing_balance: statement.closing_balance?.toString() ?? null,
      file_name: statement.file_name,
      file_url: statement.file_url,
      created_at: statement.created_at,
      summary: { total: statement.transactions.length, matched, unmatched, excluded },
      system_balance: { debit: systemDebit, credit: systemCredit },
      transactions: statement.transactions.map((t) => ({
        id: t.id,
        transaction_date: t.transaction_date,
        description: t.description,
        reference: t.reference,
        cheque_number: t.cheque_number,
        debit: t.debit?.toString() ?? null,
        credit: t.credit?.toString() ?? null,
        balance: t.balance?.toString() ?? null,
        recon_status: t.recon_status,
        matched_at: t.matched_at,
        notes: t.notes,
        matched_payment: t.matchedPayment ? {
          id: t.matchedPayment.id,
          reference: t.matchedPayment.reference,
          payment_date: t.matchedPayment.payment_date,
          amount: t.matchedPayment.amount.toString(),
          direction: t.matchedPayment.direction,
          notes: t.matchedPayment.notes,
          supplier_name: t.matchedPayment.supplier.name,
          allocations: t.matchedPayment.allocations.map((a) => ({
            invoice_id: a.invoice_id,
            invoice_number: a.invoice.invoice_number,
            vendor_name: a.invoice.vendor_name_raw,
            total_amount: a.invoice.total_amount.toString(),
            issue_date: a.invoice.issue_date,
            allocated_amount: a.amount.toString(),
          })),
          receipts: t.matchedPayment.receipts.map((r) => ({
            id: r.claim.id,
            merchant: r.claim.merchant,
            receipt_number: r.claim.receipt_number,
            amount: r.claim.amount.toString(),
            claim_date: r.claim.claim_date,
            thumbnail_url: r.claim.thumbnail_url,
          })),
        } : null,
      })),
    },
    error: null,
  });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
