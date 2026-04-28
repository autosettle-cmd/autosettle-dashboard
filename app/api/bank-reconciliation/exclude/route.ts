import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const firmIds = await getAccountantFirmIds(session.user.id);

    const { bankTransactionId, notes } = await request.json();
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

    // Clear any claims linked to this txn via join table + legacy FK
    await prisma.bankTransactionClaim.deleteMany({ where: { bank_transaction_id: bankTransactionId } });
    await prisma.claim.updateMany({ where: { matched_bank_txn_id: bankTransactionId }, data: { matched_bank_txn_id: null, payment_status: 'unpaid' } });

    // Clear invoice allocations via join table
    const invoiceAllocs = await prisma.bankTransactionInvoice.findMany({
      where: { bank_transaction_id: bankTransactionId },
      select: { invoice_id: true },
    });
    if (invoiceAllocs.length > 0) {
      await prisma.bankTransactionInvoice.deleteMany({ where: { bank_transaction_id: bankTransactionId } });
      for (const alloc of invoiceAllocs) {
        await recalcInvoicePaid(alloc.invoice_id);
      }
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { recon_status: 'excluded', matched_payment_id: null, matched_sales_invoice_id: null, notes: notes || null, matched_at: new Date(), matched_by: session.user.id },
    });
    return NextResponse.json({ data: { id: updated.id, recon_status: updated.recon_status }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
