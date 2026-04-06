import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');

  if (!firmId) {
    return NextResponse.json({ data: null, error: 'firmId is required' }, { status: 400 });
  }

  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  const fiscalYears = await prisma.fiscalYear.findMany({
    where: { firm_id: firmId },
    include: {
      periods: { orderBy: { period_number: 'asc' } },
    },
    orderBy: { start_date: 'desc' },
  });

  return NextResponse.json({ data: fiscalYears, error: null, meta: { count: fiscalYears.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { firmId, yearLabel, startMonth, startYear } = body;

  if (!firmId || !yearLabel || startMonth === undefined || !startYear) {
    return NextResponse.json({ data: null, error: 'firmId, yearLabel, startMonth (0-11), and startYear are required' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  // Calculate fiscal year dates and 12 monthly periods
  const fyStart = new Date(startYear, startMonth, 1);
  const fyEnd = new Date(startYear + 1, startMonth, 0); // Last day of month before next year's start

  const periods: { period_number: number; start_date: Date; end_date: Date }[] = [];
  for (let i = 0; i < 12; i++) {
    const pStart = new Date(startYear, startMonth + i, 1);
    const pEnd = new Date(startYear, startMonth + i + 1, 0); // Last day of month
    periods.push({
      period_number: i + 1,
      start_date: pStart,
      end_date: pEnd,
    });
  }

  try {
    const fiscalYear = await prisma.fiscalYear.create({
      data: {
        firm_id: firmId,
        year_label: yearLabel,
        start_date: fyStart,
        end_date: fyEnd,
        periods: {
          create: periods,
        },
      },
      include: {
        periods: { orderBy: { period_number: 'asc' } },
      },
    });

    return NextResponse.json({ data: fiscalYear, error: null }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create fiscal year';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A fiscal year with this label already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
