import { prisma } from './prisma';

export async function recalcInvoicePayment(invoiceId: string) {
  const result = await prisma.paymentAllocation.aggregate({
    where: { invoice_id: invoiceId },
    _sum: { amount: true },
  });
  const totalPaid = Number(result._sum.amount ?? 0);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { total_amount: true },
  });
  if (!invoice) return;

  const total = Number(invoice.total_amount);
  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' = 'unpaid';
  if (totalPaid >= total) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partially_paid';

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { amount_paid: totalPaid, payment_status: paymentStatus },
  });
}
