import { prisma } from './prisma';

export async function recalcSalesInvoicePayment(salesInvoiceId: string) {
  const result = await prisma.salesPaymentAllocation.aggregate({
    where: { sales_invoice_id: salesInvoiceId },
    _sum: { amount: true },
  });
  const totalPaid = Number(result._sum.amount ?? 0);
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: salesInvoiceId },
    select: { total_amount: true },
  });
  if (!invoice) return;

  const total = Number(invoice.total_amount);
  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' = 'unpaid';
  if (totalPaid >= total) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partially_paid';

  await prisma.salesInvoice.update({
    where: { id: salesInvoiceId },
    data: { amount_paid: totalPaid, payment_status: paymentStatus },
  });
}
