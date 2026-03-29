import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

  await Promise.all(
    chunks.map((chunk) =>
      prisma.claim.updateMany({
        where: { id: { in: chunk }, firm_id: firmId },
        data: { status: 'reviewed' },
      })
    )
  );

  return NextResponse.json({ data: { updated: claimIds.length }, error: null });
}
