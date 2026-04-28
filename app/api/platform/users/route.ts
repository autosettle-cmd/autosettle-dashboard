import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'platform_owner') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { is_active: true };
    if (role) where.role = role;

    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ data: users, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
