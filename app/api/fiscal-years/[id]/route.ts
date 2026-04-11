import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createYearEndClosingEntries, reverseJVsForSource } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const fy = await prisma.fiscalYear.findUnique({
    where: { id },
    include: { periods: { orderBy: { period_number: 'asc' } } },
  });
  if (!fy) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(fy.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  if (!status || !['open', 'closed'].includes(status)) {
    return NextResponse.json({ data: null, error: 'status must be "open" or "closed"' }, { status: 400 });
  }

  try {
    if (status === 'closed') {
      // ── CLOSING: Create closing entries FIRST (needs open period), then close everything ──

      // Ensure the last period is open for posting closing entries
      const lastPeriod = fy.periods[fy.periods.length - 1];
      if (!lastPeriod) {
        return NextResponse.json({ data: null, error: 'Fiscal year has no periods' }, { status: 400 });
      }

      // Temporarily open the last period if it's closed (not locked)
      const lastPeriodWasClosed = lastPeriod.status === 'closed';
      if (lastPeriod.status === 'locked') {
        return NextResponse.json({
          data: null,
          error: 'Cannot close fiscal year: the last period is locked. Unlock it first to allow closing entries.',
        }, { status: 400 });
      }
      if (lastPeriodWasClosed) {
        await prisma.period.update({ where: { id: lastPeriod.id }, data: { status: 'open' } });
      }

      // Create year-end closing entries (zeros Revenue/Expense, posts to Retained Earnings)
      await createYearEndClosingEntries(fy.firm_id, id, session.user.id);

      // Close all periods
      await prisma.period.updateMany({
        where: { fiscal_year_id: id },
        data: { status: 'closed' },
      });

      // Close the fiscal year
      const updated = await prisma.fiscalYear.update({
        where: { id },
        data: { status: 'closed' },
        include: { periods: { orderBy: { period_number: 'asc' } } },
      });

      return NextResponse.json({ data: updated, error: null });

    } else {
      // ── REOPENING: Reverse closing entries, then reopen FY and periods ──

      // Reopen the fiscal year first
      await prisma.fiscalYear.update({ where: { id }, data: { status: 'open' } });

      // Reopen all non-locked periods
      await prisma.period.updateMany({
        where: { fiscal_year_id: id, status: { not: 'locked' } },
        data: { status: 'open' },
      });

      // Reverse the year-end closing entries
      await reverseJVsForSource('year_end_close', id, session.user.id);

      const updated = await prisma.fiscalYear.findUnique({
        where: { id },
        include: { periods: { orderBy: { period_number: 'asc' } } },
      });

      return NextResponse.json({ data: updated, error: null });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update fiscal year';
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
