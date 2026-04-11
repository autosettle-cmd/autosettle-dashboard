import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const role = session.user.role;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let where: any = { status: 'pending_onboarding', role: 'employee' };

  if (role === 'admin') {
    if (!session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    where.firm_id = session.user.firm_id;
  } else if (role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    const { searchParams } = new URL(request.url);
    const selectedFirmId = searchParams.get('firmId');
    const scope = firmScope(firmIds, selectedFirmId);
    where = { ...where, ...scope };
  } else {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      employee: { select: { phone: true } },
      firm: { select: { name: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  const data = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.employee?.phone ?? '',
    firm_name: u.firm?.name ?? '',
    firm_id: u.firm_id,
    created_at: u.created_at,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
