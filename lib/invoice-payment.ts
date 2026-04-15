import { prisma } from './prisma';

/**
 * Recalculate invoice amount_paid from two independent sources:
 * - Receipt links (admin/internal aging)
 * - Bank recon allocations (accountant/JV truth)
 *
 * amount_paid = MAX(total receipt amount, total bank recon amount)
 * Bank recon is prioritised as the source of truth.
 */
export async function recalcInvoicePaid(invoiceId: string) {
  const [receiptLinks, bankTxnAllocations, invoice] = await Promise.all([
    prisma.invoiceReceiptLink.findMany({
      where: { invoice_id: invoiceId },
      select: { amount: true },
    }),
    prisma.bankTransactionInvoice.findMany({
      where: { invoice_id: invoiceId },
      select: { amount: true },
    }),
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { total_amount: true },
    }),
  ]);

  if (!invoice) return;

  const receiptTotal = receiptLinks.reduce((s, l) => s + Number(l.amount), 0);
  const bankReconTotal = bankTxnAllocations.reduce((s, l) => s + Number(l.amount), 0);
  const total = Number(invoice.total_amount);
  // Cap at invoice total — can't pay more than owed
  const amountPaid = Math.min(Math.max(receiptTotal, bankReconTotal), total);

  const status = amountPaid >= total ? 'paid' : amountPaid > 0 ? 'partially_paid' : 'unpaid';

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { amount_paid: amountPaid, payment_status: status },
  });
}
