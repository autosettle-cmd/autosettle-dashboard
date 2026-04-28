import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { softDeleteClaims } from '@/lib/soft-delete';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
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

    const accessible = await prisma.claim.findMany({
      where: { id: { in: claimIds }, firm_id: firmId },
      select: { id: true },
    });
    if (accessible.length === 0) {
      return NextResponse.json({ data: null, error: 'No claims found' }, { status: 404 });
    }

    const result = await softDeleteClaims(accessible.map(c => c.id), session.user.id, session.user.name);
    if (result.blockers?.length) {
      return NextResponse.json({ data: null, error: 'Cannot delete', blockers: result.blockers }, { status: 400 });
    }

    return NextResponse.json({ data: { deleted: result.deleted }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
