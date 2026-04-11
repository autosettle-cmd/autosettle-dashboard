import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { reverseJVsForSource } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json();
  const { claimIds } = body as { claimIds: string[] };

  if (!claimIds?.length) {
    return NextResponse.json({ data: null, error: 'claimIds is required' }, { status: 400 });
  }

  const claims = await prisma.claim.findMany({
    where: { id: { in: claimIds }, firm_id: firmId },
    select: { id: true, merchant: true, amount: true, status: true, approval: true, payment_status: true },
  });

  if (claims.length === 0) {
    return NextResponse.json({ data: null, error: 'No claims found' }, { status: 404 });
  }

  // Block delete if any claim has payments
  const withPayments = await prisma.paymentReceipt.findMany({
    where: { claim_id: { in: claimIds } },
    select: { claim_id: true },
  });
  if (withPayments.length > 0) {
    return NextResponse.json({ data: null, error: 'Cannot delete claims with linked payments. Remove payments first.' }, { status: 400 });
  }

  // Reverse any JVs created from claim approval
  for (const claim of claims) {
    if (claim.approval === 'approved') {
      await reverseJVsForSource('claim_approval', claim.id, session.user.id);
    }
  }

  await prisma.claim.deleteMany({ where: { id: { in: claims.map(c => c.id) } } });

  for (const claim of claims) {
    auditLog({
      firmId,
      tableName: 'Claim',
      recordId: claim.id,
      action: 'delete',
      oldValues: { merchant: claim.merchant, amount: Number(claim.amount), status: claim.status, approval: claim.approval },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { deleted: claims.length }, error: null });
}
