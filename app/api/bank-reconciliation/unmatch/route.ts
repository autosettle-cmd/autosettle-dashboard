import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { reverseBankReconJV } from '@/lib/bank-recon-jv';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionId } = await request.json();
  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }

  const jvResult = await reverseBankReconJV(bankTransactionId, session.user.id);
  const txnAmount = Number(txn.debit ?? txn.credit ?? 0);

  // Revert invoice allocations via join table
  const invoiceAllocs = await prisma.bankTransactionInvoice.findMany({
    where: { bank_transaction_id: bankTransactionId },
    select: { invoice_id: true },
  });
  const affectedInvoiceIds = invoiceAllocs.map(a => a.invoice_id);
  if (affectedInvoiceIds.length > 0) {
    await prisma.bankTransactionInvoice.deleteMany({ where: { bank_transaction_id: bankTransactionId } });
    for (const invoiceId of affectedInvoiceIds) {
      await recalcInvoicePaid(invoiceId);
    }
  }

  if (txn.matched_sales_invoice_id) {
    const inv = await prisma.salesInvoice.findUnique({ where: { id: txn.matched_sales_invoice_id }, select: { amount_paid: true } });
    if (inv) {
      const newPaid = Math.max(0, Number(inv.amount_paid) - txnAmount);
      await prisma.salesInvoice.update({ where: { id: txn.matched_sales_invoice_id }, data: { amount_paid: newPaid, payment_status: newPaid <= 0 ? 'unpaid' : 'partially_paid' } });
    }
  }
  // Revert claims linked via join table + legacy FK
  await prisma.bankTransactionClaim.deleteMany({ where: { bank_transaction_id: bankTransactionId } });
  await prisma.claim.updateMany({ where: { matched_bank_txn_id: bankTransactionId }, data: { matched_bank_txn_id: null, payment_status: 'unpaid' } });

  // Clean up legacy auto-created Payment
  if (txn.matched_payment_id) {
    const payment = await prisma.payment.findUnique({ where: { id: txn.matched_payment_id }, select: { id: true, notes: true } });
    if (payment?.notes?.startsWith('Auto-matched from receipt')) {
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
    }
  }

  const updated = await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: { matched_payment_id: null, matched_sales_invoice_id: null, recon_status: 'unmatched', matched_at: null, matched_by: null, notes: null },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      recon_status: updated.recon_status,
      ...(jvResult.error && { jv_warning: jvResult.error }),
    },
    error: null,
  });
}
