import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const role = session.user.role;
  const { id } = await params;

  // Find the pending user
  const user = await prisma.user.findFirst({
    where: { id, status: 'pending_onboarding' },
  });
  if (!user) {
    return NextResponse.json({ data: null, error: 'User not found or not pending' }, { status: 404 });
  }

  // Verify access
  if (role === 'admin') {
    if (!session.user.firm_id || user.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && user.firm_id && !firmIds.includes(user.firm_id)) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: 'active', is_active: true },
    select: { id: true, name: true, email: true, status: true },
  });

  return NextResponse.json({ data: updated, error: null });
}
