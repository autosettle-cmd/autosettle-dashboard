import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    session.user.role !== 'employee' ||
    !session.user.employee_id
  ) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const firmId = session.user.firm_id;

  if (!firmId) {
    return NextResponse.json(
      { data: null, error: 'Employee has no firm assigned' },
      { status: 400 }
    );
  }

  // Get global defaults with overrides for this firm
  const globals = await prisma.category.findMany({
    where: { firm_id: null, is_active: true },
    include: { overrides: { where: { firm_id: firmId } } },
    orderBy: { name: 'asc' },
  });

  // Filter out globals disabled for this firm
  const activeGlobals = globals.filter((g) => {
    if (g.overrides.length === 0) return true;
    return g.overrides[0].is_active;
  });

  // Get firm-specific categories
  const firmCats = await prisma.category.findMany({
    where: { firm_id: firmId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const all = [
    ...activeGlobals.map((g) => ({ id: g.id, name: g.name })),
    ...firmCats,
  ].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ data: all, error: null });
}
