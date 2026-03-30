import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const { id } = await params;

  // Verify user belongs to admin's firm and is pending
  const user = await prisma.user.findFirst({
    where: { id, firm_id: firmId, status: 'pending_onboarding' },
  });
  if (!user) {
    return NextResponse.json({ data: null, error: 'User not found or not pending' }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: 'active', is_active: true },
    select: { id: true, name: true, email: true, status: true },
  });

  return NextResponse.json({ data: updated, error: null });
}
