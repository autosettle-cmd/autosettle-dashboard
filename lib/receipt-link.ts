import { prisma } from './prisma';

// Re-export the shared recalc for backward compat
export { recalcInvoicePaid } from './invoice-payment';

/**
 * Get unallocated amount remaining on a receipt (claim type='receipt').
 */
export async function getReceiptUnallocated(claimId: string): Promise<number> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { amount: true },
  });
  if (!claim) return 0;

  const links = await prisma.invoiceReceiptLink.findMany({
    where: { claim_id: claimId },
    select: { amount: true },
  });

  const allocated = links.reduce((s, l) => s + Number(l.amount), 0);
  return Number(claim.amount) - allocated;
}
