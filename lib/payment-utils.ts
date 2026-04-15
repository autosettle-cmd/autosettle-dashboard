import { prisma } from './prisma';

export async function recalcClaimPayment(claimId: string) {
  const [paymentResult, invoiceLinkResult] = await Promise.all([
    prisma.paymentReceipt.aggregate({
      where: { claim_id: claimId },
      _sum: { amount: true },
    }),
    prisma.invoiceReceiptLink.aggregate({
      where: { claim_id: claimId },
      _sum: { amount: true },
    }),
  ]);
  const totalPaid = Number(paymentResult._sum.amount ?? 0) + Number(invoiceLinkResult._sum.amount ?? 0);
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { amount: true },
  });
  if (!claim) return;

  const total = Number(claim.amount);
  let paymentStatus: 'unpaid' | 'partially_paid' | 'paid' = 'unpaid';
  if (totalPaid >= total) paymentStatus = 'paid';
  else if (totalPaid > 0) paymentStatus = 'partially_paid';

  await prisma.claim.update({
    where: { id: claimId },
    data: { amount_paid: totalPaid, payment_status: paymentStatus },
  });
}

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
