import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { accountId } = await params;
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

  // Verify account belongs to firm
  const account = await prisma.gLAccount.findUnique({
    where: { id: accountId },
    select: { id: true, firm_id: true, account_code: true, name: true, account_type: true, normal_balance: true },
  });
  if (!account || account.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 });
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

  // ── Calculate opening balance (Balance B/F) ──
  // Sum all posted transactions BEFORE the effective start date
  let openingBalance = 0;
  let effectiveStartDate: Date | null = null;

  if (periodId) {
    const period = await prisma.period.findUnique({ where: { id: periodId }, select: { start_date: true } });
    if (period) effectiveStartDate = period.start_date;
  } else if (dateFrom) {
    effectiveStartDate = new Date(dateFrom);
  }

  if (effectiveStartDate) {
    const priorAgg = await prisma.journalLine.aggregate({
      where: {
        gl_account_id: accountId,
        journalEntry: {
          firm_id: firmId,
          status: 'posted',
          posting_date: { lt: effectiveStartDate },
        },
      },
      _sum: { debit_amount: true, credit_amount: true },
    });
    const priorDebit = Number(priorAgg._sum.debit_amount ?? 0);
    const priorCredit = Number(priorAgg._sum.credit_amount ?? 0);
    const isDebitNormalBF = account.normal_balance === 'Debit';
    openingBalance = isDebitNormalBF ? (priorDebit - priorCredit) : (priorCredit - priorDebit);
  }

  const lines = await prisma.journalLine.findMany({
    where: {
      gl_account_id: accountId,
      journalEntry: entryWhere,
    },
    include: {
      journalEntry: {
        select: {
          voucher_number: true,
          posting_date: true,
          description: true,
          source_type: true,
          status: true,
          reversal_of_id: true,
        },
      },
    },
    orderBy: { journalEntry: { posting_date: 'asc' } },
  });

  // Compute running balance (seeded from opening balance)
  let runningBalance = openingBalance;
  const isDebitNormal = account.normal_balance === 'Debit';
  const mappedLines = lines.map((line) => {
    const debit = Number(line.debit_amount);
    const credit = Number(line.credit_amount);
    runningBalance += isDebitNormal ? (debit - credit) : (credit - debit);
    return {
      id: line.id,
      voucher_number: line.journalEntry.voucher_number,
      posting_date: line.journalEntry.posting_date,
      source_type: line.journalEntry.source_type,
      status: line.journalEntry.status,
      reversal_of_id: line.journalEntry.reversal_of_id,
      entry_description: line.journalEntry.description,
      line_description: line.description,
      debit_amount: debit,
      credit_amount: credit,
      running_balance: runningBalance,
    };
  });

  const totalDebit = mappedLines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = mappedLines.reduce((s, l) => s + l.credit_amount, 0);
  const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;

  return NextResponse.json({
    data: {
      account: {
        id: account.id,
        account_code: account.account_code,
        name: account.name,
        account_type: account.account_type,
        normal_balance: account.normal_balance,
      },
      lines: mappedLines,
      opening_balance: openingBalance,
      total_debit: totalDebit,
      total_credit: totalCredit,
      balance,
    },
    error: null,
  });
}
