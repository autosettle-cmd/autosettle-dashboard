import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { receiptIds, action } = body as {
    receiptIds: string[];
    action: 'approve' | 'reject';
  };

  if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
    return NextResponse.json({ data: null, error: 'receiptIds required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const scope = firmScope(firmIds);

  const updateData =
    action === 'approve'
      ? { approval: 'approved' as const }
      : { approval: 'not_approved' as const };

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < receiptIds.length; i += CHUNK) {
    chunks.push(receiptIds.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map((chunk) =>
      prisma.receipt.updateMany({
        where: { id: { in: chunk }, ...scope },
        data: updateData,
      })
    )
  );

  return NextResponse.json({ data: { updated: receiptIds.length }, error: null });
}
