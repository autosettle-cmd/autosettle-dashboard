import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { claimIds, action, reason } = body as {
    claimIds: string[];
    action: 'approve' | 'reject';
    reason?: string;
  };

  if (!Array.isArray(claimIds) || claimIds.length === 0) {
    return NextResponse.json({ data: null, error: 'claimIds required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const updateData =
    action === 'approve'
      ? { approval: 'approved' as const, rejection_reason: null as string | null }
      : { approval: 'not_approved' as const, rejection_reason: (reason ?? null) as string | null };

  // Chunk at 20 per engineering rules
  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < claimIds.length; i += CHUNK) {
    chunks.push(claimIds.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map((chunk) =>
      prisma.claim.updateMany({
        where: { id: { in: chunk } },
        data: updateData,
      })
    )
  );

  return NextResponse.json({ data: { updated: claimIds.length }, error: null });
}
