import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json();
  const { claimIds, action } = body as {
    claimIds: string[];
    action: 'review';
  };

  if (!Array.isArray(claimIds) || claimIds.length === 0) {
    return NextResponse.json({ data: null, error: 'claimIds required' }, { status: 400 });
  }
  if (action !== 'review') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < claimIds.length; i += CHUNK) {
    chunks.push(claimIds.slice(i, i + CHUNK));
  }

  // Fetch old values for audit before updating
  const oldClaims = await prisma.claim.findMany({
    where: { id: { in: claimIds }, firm_id: firmId },
    select: { id: true, status: true },
  });

  await Promise.all(
    chunks.map((chunk) =>
      prisma.claim.updateMany({
        where: { id: { in: chunk }, firm_id: firmId },
        data: { status: 'reviewed' },
      })
    )
  );

  // Audit log per claim
  for (const claim of oldClaims) {
    await auditLog({
      firmId,
      tableName: 'Claim',
      recordId: claim.id,
      action: 'update',
      oldValues: { status: claim.status },
      newValues: { status: 'reviewed' },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { updated: claimIds.length }, error: null });
}
