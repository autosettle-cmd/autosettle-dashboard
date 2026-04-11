import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { createJournalEntry } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const sourceType = searchParams.get('sourceType');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };

  if (dateFrom || dateTo) {
    where.posting_date = {};
    if (dateFrom) where.posting_date.gte = new Date(dateFrom);
    if (dateTo) where.posting_date.lte = new Date(dateTo);
  }
  if (sourceType) where.source_type = sourceType;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { voucher_number: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [entries, totalCount] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: {
            glAccount: { select: { account_code: true, name: true } },
          },
          orderBy: { debit_amount: 'desc' },
        },
        period: { select: { period_number: true, fiscalYear: { select: { year_label: true } } } },
        firm: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: takeParam || 100,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  const data = entries.map((e) => ({
    id: e.id,
    firm_id: e.firm_id,
    firm_name: e.firm.name,
    voucher_number: e.voucher_number,
    posting_date: e.posting_date,
    period_label: `${e.period.fiscalYear.year_label} P${e.period.period_number}`,
    description: e.description,
    source_type: e.source_type,
    source_id: e.source_id,
    status: e.status,
    reversed_by_id: e.reversed_by_id,
    reversal_of_id: e.reversal_of_id,
    created_by: e.created_by,
    created_at: e.created_at,
    total_debit: e.lines.reduce((sum, l) => sum + Number(l.debit_amount), 0),
    total_credit: e.lines.reduce((sum, l) => sum + Number(l.credit_amount), 0),
    lines: e.lines.map((l) => ({
      id: l.id,
      account_code: l.glAccount.account_code,
      account_name: l.glAccount.name,
      debit_amount: Number(l.debit_amount),
      credit_amount: Number(l.credit_amount),
      description: l.description,
    })),
  }));

  return NextResponse.json({ data, error: null, hasMore: totalCount > (takeParam || 100), totalCount });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  const body = await request.json();
  const { firmId, postingDate, description, lines } = body as {
    firmId: string;
    postingDate: string;
    description?: string;
    lines: { glAccountId: string; debitAmount: number; creditAmount: number; description?: string }[];
  };

  if (!firmId || !postingDate || !lines || lines.length < 2) {
    return NextResponse.json({ data: null, error: 'firmId, postingDate, and at least 2 lines required' }, { status: 400 });
  }

  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const entry = await createJournalEntry({
      firmId,
      postingDate: new Date(postingDate),
      description,
      sourceType: 'manual',
      lines: lines.map((l) => ({
        glAccountId: l.glAccountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description,
      })),
      createdBy: session.user.id,
    });

    return NextResponse.json({ data: { id: entry.id, voucher_number: entry.voucher_number }, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create journal entry';
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
