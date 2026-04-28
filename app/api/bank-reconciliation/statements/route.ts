import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

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
    const scope = firmScope(firmIds, firmId);

    const statements = await prisma.bankStatement.findMany({
      where: scope,
      select: {
        id: true,
        firm_id: true,
        bank_name: true,
        account_number: true,
        statement_date: true,
        opening_balance: true,
        closing_balance: true,
        file_name: true,
        file_url: true,
        period_start: true,
        period_end: true,
        created_at: true,
        firm: { select: { name: true } },
      },
      orderBy: { statement_date: 'desc' },
      take: 100,
    });

    const statusCounts = await prisma.bankTransaction.groupBy({
      by: ['bank_statement_id', 'recon_status'],
      where: { bank_statement_id: { in: statements.map((s) => s.id) } },
      _count: true,
    });

    const countMap = new Map<string, { matched: number; unmatched: number; excluded: number; total: number }>();
    for (const row of statusCounts) {
      const entry = countMap.get(row.bank_statement_id) ?? { matched: 0, unmatched: 0, excluded: 0, total: 0 };
      entry.total += row._count;
      if (row.recon_status === 'matched' || row.recon_status === 'manually_matched') entry.matched += row._count;
      else if (row.recon_status === 'unmatched') entry.unmatched += row._count;
      else if (row.recon_status === 'excluded') entry.excluded += row._count;
      countMap.set(row.bank_statement_id, entry);
    }

    const data = statements.map((s) => {
      const counts = countMap.get(s.id) ?? { matched: 0, unmatched: 0, excluded: 0, total: 0 };
      return {
        id: s.id,
        bank_name: s.bank_name,
        account_number: s.account_number,
        statement_date: s.statement_date,
        opening_balance: s.opening_balance?.toString() ?? null,
        closing_balance: s.closing_balance?.toString() ?? null,
        file_name: s.file_name,
        file_url: s.file_url,
        firm_name: s.firm.name,
        firm_id: s.firm_id,
        period_start: s.period_start,
        period_end: s.period_end,
        created_at: s.created_at,
        total: counts.total,
        matched: counts.matched,
        unmatched: counts.unmatched,
        excluded: counts.excluded,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
