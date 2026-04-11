import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  // Get global defaults with overrides for this firm
  const globals = await prisma.category.findMany({
    where: { firm_id: null, is_active: true },
    include: {
      overrides: { where: { firm_id: firmId } },
      _count: { select: { claims: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Filter out globals where override is_active = false
  const activeGlobals = globals.filter((g) => {
    if (g.overrides.length === 0) return true;
    return g.overrides[0].is_active;
  });

  // Get firm-specific categories
  const firmCats = await prisma.category.findMany({
    where: { firm_id: firmId, is_active: true },
    include: { _count: { select: { claims: true } } },
    orderBy: { name: 'asc' },
  });

  const all = [...activeGlobals, ...firmCats].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    data: all.map((c) => ({ id: c.id, name: c.name })),
    error: null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json();
  const { name, taxCode } = body;

  if (!name) {
    return NextResponse.json({ data: null, error: 'Name is required' }, { status: 400 });
  }

  try {
    const category = await prisma.category.create({
      data: {
        name,
        firm_id: firmId,
        tax_code: taxCode || null,
      },
    });

    return NextResponse.json({ data: category, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create category';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A category with this name already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
