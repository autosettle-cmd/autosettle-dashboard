import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const users = await prisma.user.findMany({
    where: { firm_id: firmId, status: 'pending_onboarding', role: 'employee' },
    include: { employee: { select: { phone: true } } },
    orderBy: { created_at: 'desc' },
  });

  const data = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.employee?.phone ?? '',
    created_at: u.created_at,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
