import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, isAccountantOwner } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const isOwner = await isAccountantOwner(session.user.id);
    if (!isOwner) {
      return NextResponse.json({ data: null, error: 'Only firm owners can manage team' }, { status: 403 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);

    const teamMembers = await prisma.user.findMany({
      where: {
        role: 'accountant',
        id: { not: session.user.id },
        accountantFirms: { some: firmIds ? { firm_id: { in: firmIds } } : {} },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        is_active: true,
        created_at: true,
        accountantFirms: {
          select: {
            firm: { select: { id: true, name: true } },
            role: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const members = teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      status: m.status,
      isActive: m.is_active,
      createdAt: m.created_at,
      firms: m.accountantFirms.map((af) => ({ id: af.firm.id, name: af.firm.name })),
      role: m.accountantFirms[0]?.role ?? 'member',
    }));

    return NextResponse.json({ data: members, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
