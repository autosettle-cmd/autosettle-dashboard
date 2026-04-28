import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    const { searchParams } = new URL(request.url);
    const firmId = searchParams.get('firmId');
    const periodId = searchParams.get('periodId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!firmId) {
      return NextResponse.json({ data: null, error: 'firmId is required' }, { status: 400 });
    }
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
    }

    // Build journal entry filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entryWhere: any = {
      firm_id: firmId,
      status: 'posted',
    };
    if (periodId) entryWhere.period_id = periodId;
    if (dateFrom || dateTo) {
      entryWhere.posting_date = {};
      if (dateFrom) entryWhere.posting_date.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        entryWhere.posting_date.lte = to;
      }
    }

    // Aggregate journal lines per GL account
    const aggregates = await prisma.journalLine.groupBy({
      by: ['gl_account_id'],
      where: { journalEntry: entryWhere },
      _sum: { debit_amount: true, credit_amount: true },
    });

    const aggregateMap = new Map(
      aggregates.map((a) => [a.gl_account_id, {
        total_debit: Number(a._sum.debit_amount ?? 0),
        total_credit: Number(a._sum.credit_amount ?? 0),
      }])
    );

    // Fetch all GL accounts for the firm
    const glAccounts = await prisma.gLAccount.findMany({
      where: { firm_id: firmId },
      orderBy: [{ account_code: 'asc' }],
      take: 500, // Safety limit — paginate if data exceeds this
    });

    const accounts = glAccounts.map((a) => {
      const agg = aggregateMap.get(a.id) ?? { total_debit: 0, total_credit: 0 };
      const balance = a.normal_balance === 'Debit'
        ? agg.total_debit - agg.total_credit
        : agg.total_credit - agg.total_debit;

      return {
        id: a.id,
        account_code: a.account_code,
        name: a.name,
        account_type: a.account_type,
        normal_balance: a.normal_balance,
        parent_id: a.parent_id,
        is_active: a.is_active,
        total_debit: agg.total_debit,
        total_credit: agg.total_credit,
        balance,
      };
    });

    const summary = {
      total_debit: accounts.reduce((s, a) => s + a.total_debit, 0),
      total_credit: accounts.reduce((s, a) => s + a.total_credit, 0),
    };

    return NextResponse.json({ data: { accounts, summary }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
