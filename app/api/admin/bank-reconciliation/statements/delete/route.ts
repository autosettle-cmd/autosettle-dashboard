import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { statementId } = await request.json();
    if (!statementId) {
      return NextResponse.json({ error: 'statementId required' }, { status: 400 });
    }

    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId, firm_id: session.user.firm_id },
      select: { id: true },
    });

    if (!statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }

    // Revert all direct invoice/claim matches
    const allTxns = await prisma.bankTransaction.findMany({
      where: { bank_statement_id: statementId },
      select: { id: true, debit: true, credit: true, matched_payment_id: true, matched_invoice_id: true, matched_sales_invoice_id: true, matched_claim_id: true },
    });

    for (const t of allTxns) {
      const txnAmount = Number(t.debit ?? t.credit ?? 0);
      if (t.matched_invoice_id) {
        const inv = await prisma.invoice.findUnique({ where: { id: t.matched_invoice_id }, select: { amount_paid: true } });
        if (inv) {
          const newPaid = Math.max(0, Number(inv.amount_paid) - txnAmount);
          await prisma.invoice.update({ where: { id: t.matched_invoice_id }, data: { amount_paid: newPaid, payment_status: newPaid <= 0 ? 'unpaid' : 'partially_paid' } });
        }
      }
      if (t.matched_sales_invoice_id) {
        const inv = await prisma.salesInvoice.findUnique({ where: { id: t.matched_sales_invoice_id }, select: { amount_paid: true } });
        if (inv) {
          const newPaid = Math.max(0, Number(inv.amount_paid) - txnAmount);
          await prisma.salesInvoice.update({ where: { id: t.matched_sales_invoice_id }, data: { amount_paid: newPaid, payment_status: newPaid <= 0 ? 'unpaid' : 'partially_paid' } });
        }
      }
      if (t.matched_claim_id) {
        await prisma.claim.update({ where: { id: t.matched_claim_id }, data: { payment_status: 'unpaid' } });
      }
    }

    // Clean up legacy Payment-based matches
    const paymentIds = allTxns.filter(t => t.matched_payment_id).map(t => t.matched_payment_id!);
    if (paymentIds.length > 0) {
      const paymentReceipts = await prisma.paymentReceipt.findMany({ where: { payment_id: { in: paymentIds } }, select: { claim_id: true } });
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      const claimIds = paymentReceipts.filter(pr => pr.claim_id).map(pr => pr.claim_id!);
      if (claimIds.length > 0) {
        await prisma.claim.updateMany({ where: { id: { in: claimIds } }, data: { payment_status: 'unpaid' } });
      }
    }

    // Reverse JVs
    const { reverseJVsForSource } = await import('@/lib/journal-entries');
    for (const t of allTxns) {
      if (t.matched_invoice_id || t.matched_sales_invoice_id || t.matched_claim_id || t.matched_payment_id) {
        await reverseJVsForSource('bank_recon', t.id, session.user.id).catch(() => {});
      }
    }

    // Now safe to delete transactions and statement
    await prisma.bankTransaction.deleteMany({ where: { bank_statement_id: statementId } });
    await prisma.bankStatement.delete({ where: { id: statementId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete statement error:', err);
    return NextResponse.json({ error: `Failed to delete: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
