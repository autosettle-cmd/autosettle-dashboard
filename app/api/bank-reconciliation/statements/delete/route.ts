import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { statementId } = await request.json();
    if (!statementId) {
      return NextResponse.json({ error: 'statementId required' }, { status: 400 });
    }

    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId },
      select: { id: true, firm_id: true },
    });

    if (!statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(statement.firm_id)) {
      return NextResponse.json({ error: 'Unauthorized for this firm' }, { status: 403 });
    }

    // Revert all direct invoice/claim matches from this statement
    const allTxns = await prisma.bankTransaction.findMany({
      where: { bank_statement_id: statementId },
      select: { id: true, debit: true, credit: true, matched_payment_id: true, matched_sales_invoice_id: true },
    });

    // Collect txn IDs that have claims linked (before we clear them)
    const txnIds = allTxns.map(t => t.id);
    const claimLinkedTxnIds = new Set(
      (await prisma.claim.findMany({ where: { matched_bank_txn_id: { in: txnIds } }, select: { matched_bank_txn_id: true } }))
        .map(c => c.matched_bank_txn_id!)
    );

    // Revert invoice allocations via join table
    const invoiceAllocs = await prisma.bankTransactionInvoice.findMany({
      where: { bank_transaction_id: { in: txnIds } },
      select: { bank_transaction_id: true, invoice_id: true },
    });
    const affectedInvoiceIds = Array.from(new Set(invoiceAllocs.map(a => a.invoice_id)));
    const txnIdsWithInvoiceAllocs = new Set(invoiceAllocs.map(a => a.bank_transaction_id));
    if (invoiceAllocs.length > 0) {
      await prisma.bankTransactionInvoice.deleteMany({ where: { bank_transaction_id: { in: txnIds } } });
    }

    // Revert claim allocations via join table
    await prisma.bankTransactionClaim.deleteMany({ where: { bank_transaction_id: { in: txnIds } } });

    // Revert sales invoice matches
    for (const t of allTxns) {
      const txnAmount = Number(t.debit ?? t.credit ?? 0);
      if (t.matched_sales_invoice_id) {
        const inv = await prisma.salesInvoice.findUnique({ where: { id: t.matched_sales_invoice_id }, select: { amount_paid: true } });
        if (inv) {
          const newPaid = Math.max(0, Number(inv.amount_paid) - txnAmount);
          await prisma.salesInvoice.update({ where: { id: t.matched_sales_invoice_id }, data: { amount_paid: newPaid, payment_status: newPaid <= 0 ? 'unpaid' : 'partially_paid' } });
        }
      }
      // Revert claims linked via matched_bank_txn_id
      await prisma.claim.updateMany({ where: { matched_bank_txn_id: t.id }, data: { matched_bank_txn_id: null, payment_status: 'unpaid' } });
    }

    // Recalculate payment for affected invoices
    for (const invoiceId of affectedInvoiceIds) {
      await recalcInvoicePaid(invoiceId);
    }

    // Clean up legacy Payment-based matches
    const paymentIds = allTxns.filter(t => t.matched_payment_id).map(t => t.matched_payment_id!);
    if (paymentIds.length > 0) {
      // Null out FK before deleting payments to avoid constraint violation
      await prisma.bankTransaction.updateMany({
        where: { matched_payment_id: { in: paymentIds } },
        data: { matched_payment_id: null },
      });
      const paymentReceipts = await prisma.paymentReceipt.findMany({ where: { payment_id: { in: paymentIds } }, select: { claim_id: true } });
      await prisma.paymentReceipt.deleteMany({ where: { payment_id: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      const claimIds = paymentReceipts.filter(pr => pr.claim_id).map(pr => pr.claim_id!);
      if (claimIds.length > 0) {
        await prisma.claim.updateMany({ where: { id: { in: claimIds } }, data: { payment_status: 'unpaid' } });
      }
    }

    // Reverse JVs for all confirmed matches
    const { reverseJVsForSource } = await import('@/lib/journal-entries');
    const reversalErrors: string[] = [];
    for (const t of allTxns) {
      if (txnIdsWithInvoiceAllocs.has(t.id) || t.matched_sales_invoice_id || t.matched_payment_id || claimLinkedTxnIds.has(t.id)) {
        try {
          await reverseJVsForSource('bank_recon', t.id, session.user.id);
        } catch (err) {
          const msg = `Failed to reverse JV for txn ${t.id}: ${err instanceof Error ? err.message : String(err)}`;
          console.error(msg);
          reversalErrors.push(msg);
        }
      }
    }

    if (reversalErrors.length > 0) {
      return NextResponse.json(
        { error: `Statement deleted but ${reversalErrors.length} JV reversal(s) failed. Orphaned JVs may remain — use the cleanup tool to fix. Errors: ${reversalErrors.join('; ')}` },
        { status: 207 }
      );
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
