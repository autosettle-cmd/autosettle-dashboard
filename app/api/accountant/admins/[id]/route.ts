import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the admin user belongs to an assigned firm
    const user = await prisma.user.findUnique({
      where: { id },
      select: { firm_id: true, role: true },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Admin not found' }, { status: 404 });
    }

    if (!user.firm_id) {
      return NextResponse.json({ data: null, error: 'Admin has no firm' }, { status: 400 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(user.firm_id)) {
      return NextResponse.json({ data: null, error: 'Not authorized for this admin' }, { status: 403 });
    }

    const body = await request.json();
    const { is_active } = body;

    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ data: null, error: 'is_active must be a boolean' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        is_active,
        status: is_active ? 'active' : 'inactive',
      },
      select: { id: true, name: true, email: true, is_active: true, status: true },
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
