import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { firmId } = await params;
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
    }

    const accountantFirms = await prisma.accountantFirm.findMany({
      where: { firm_id: firmId },
      include: {
        user: {
          select: { id: true, name: true, email: true, status: true, is_active: true, created_at: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const data = accountantFirms.map((af) => ({
      id: af.user.id,
      name: af.user.name,
      email: af.user.email,
      status: af.user.status,
      role: af.role,
      createdAt: af.user.created_at,
    }));

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
