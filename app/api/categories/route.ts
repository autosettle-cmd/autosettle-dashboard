import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');

  if (firmId) {
    // Validate firmId is in accountant's assigned firms
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
    }

    // Get global defaults with overrides for this firm
    const globals = await prisma.category.findMany({
      where: { firm_id: null, is_active: true },
      include: {
        _count: { select: { claims: true } },
        overrides: { where: { firm_id: firmId }, include: { glAccount: { select: { account_code: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    // Get firm-specific categories
    const firmCats = await prisma.category.findMany({
      where: { firm_id: firmId, is_active: true },
      include: {
        firm: { select: { name: true } },
        _count: { select: { claims: true } },
        overrides: { where: { firm_id: firmId }, include: { glAccount: { select: { account_code: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    const data = [
      ...globals.map((g) => {
        const override = g.overrides.length > 0 ? g.overrides[0] : null;
        const gl = override?.glAccount;
        return {
          id: g.id,
          name: g.name,
          firm_id: null as string | null,
          firm_name: null as string | null,
          tax_code: g.tax_code,
          claims_count: g._count.claims,
          is_active: override ? override.is_active : true,
          is_global: true,
          gl_account_id: override?.gl_account_id ?? null,
          gl_account_label: gl ? `${gl.account_code} — ${gl.name}` : null,
        };
      }),
      ...firmCats.map((c) => {
        const override = c.overrides.length > 0 ? c.overrides[0] : null;
        const gl = override?.glAccount;
        return {
          id: c.id,
          name: c.name,
          firm_id: c.firm_id as string | null,
          firm_name: c.firm?.name ?? null,
          tax_code: c.tax_code,
          claims_count: c._count.claims,
          is_active: c.is_active,
          is_global: false,
          gl_account_id: override?.gl_account_id ?? null,
          gl_account_label: gl ? `${gl.account_code} — ${gl.name}` : null,
        };
      }),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ data, error: null, meta: { count: data.length } });
  }

  // No firmId — return all categories across assigned firms (management view)
  const assignedFirmFilter = firmIds ? { in: firmIds } : undefined;

  // Global defaults
  const globals = await prisma.category.findMany({
    where: { firm_id: null, is_active: true },
    include: { _count: { select: { claims: true } } },
    orderBy: { name: 'asc' },
  });

  // Firm-specific categories across all assigned firms
  const firmCats = await prisma.category.findMany({
    where: { firm_id: assignedFirmFilter ? { in: firmIds! } : { not: null } },
    include: {
      firm: { select: { name: true } },
      _count: { select: { claims: true } },
    },
    orderBy: [{ firm: { name: 'asc' } }, { name: 'asc' }],
  });

  const data = [
    ...globals.map((g) => ({
      id: g.id,
      name: g.name,
      firm_id: null as string | null,
      firm_name: null as string | null,
      tax_code: g.tax_code,
      claims_count: g._count.claims,
      is_active: true,
      is_global: true,
    })),
    ...firmCats.map((c) => ({
      id: c.id,
      name: c.name,
      firm_id: c.firm_id as string | null,
      firm_name: c.firm?.name ?? null,
      tax_code: c.tax_code,
      claims_count: c._count.claims,
      is_active: c.is_active,
      is_global: false,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, firmId, taxCode } = body;

  if (!name || !firmId) {
    return NextResponse.json({ data: null, error: 'Name and firmId are required' }, { status: 400 });
  }

  // Validate firmId is in accountant's assigned firms
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
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
