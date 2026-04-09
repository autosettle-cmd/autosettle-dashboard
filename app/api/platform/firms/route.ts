import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { seedCoAForFirm } from '@/lib/seed-coa';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'platform_owner') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firms = await prisma.firm.findMany({
    include: {
      _count: { select: { users: true, employees: true, claims: true, invoices: true, journalEntries: true, glAccounts: true, fiscalYears: true } },
      accountantFirms: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    data: firms.map(f => ({
      id: f.id,
      name: f.name,
      is_active: f.is_active,
      created_at: f.created_at,
      address_line1: f.address_line1,
      city: f.city,
      state: f.state,
      counts: f._count,
      accountants: f.accountantFirms.map(af => af.user),
    })),
    error: null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'platform_owner') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, address_line1, address_line2, city, postal_code, state, country, seedCoa, createFy, fyYear, accountantIds } = body;

  if (!name) {
    return NextResponse.json({ data: null, error: 'Name is required' }, { status: 400 });
  }

  try {
    const firm = await prisma.firm.create({
      data: {
        name,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        postal_code: postal_code || null,
        state: state || null,
        country: country || 'MY',
        plan: 'free',
      },
    });

    // Seed COA if requested
    if (seedCoa) {
      await seedCoAForFirm(firm.id);
    }

    // Create fiscal year if requested
    if (createFy && fyYear) {
      const year = parseInt(fyYear);
      const periods = Array.from({ length: 12 }, (_, i) => ({
        period_number: i + 1,
        start_date: new Date(year, i, 1),
        end_date: new Date(year, i + 1, 0),
      }));
      await prisma.fiscalYear.create({
        data: {
          firm_id: firm.id,
          year_label: `FY${year}`,
          start_date: new Date(year, 0, 1),
          end_date: new Date(year, 11, 31),
          periods: { create: periods },
        },
      });
    }

    // Assign accountants
    if (accountantIds?.length) {
      await prisma.accountantFirm.createMany({
        data: accountantIds.map((userId: string) => ({ user_id: userId, firm_id: firm.id })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ data: { id: firm.id, name: firm.name }, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create firm';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
