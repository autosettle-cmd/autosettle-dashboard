import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const account = await prisma.gLAccount.findUnique({ where: { id } });
    if (!account || account.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data: account, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
