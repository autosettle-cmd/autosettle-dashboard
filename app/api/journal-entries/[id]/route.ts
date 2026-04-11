import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { reverseJournalEntry } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const firmIds = await getAccountantFirmIds(session.user.id);

  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        include: { glAccount: { select: { account_code: true, name: true, account_type: true } } },
        orderBy: { debit_amount: 'desc' },
      },
      period: { select: { period_number: true, fiscalYear: { select: { year_label: true } } } },
      firm: { select: { name: true } },
    },
  });

  if (!entry || (firmIds && !firmIds.includes(entry.firm_id))) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: entry.id,
      firm_id: entry.firm_id,
      firm_name: entry.firm.name,
      voucher_number: entry.voucher_number,
      posting_date: entry.posting_date,
      period_label: `${entry.period.fiscalYear.year_label} P${entry.period.period_number}`,
      description: entry.description,
      source_type: entry.source_type,
      source_id: entry.source_id,
      status: entry.status,
      reversed_by_id: entry.reversed_by_id,
      reversal_of_id: entry.reversal_of_id,
      created_by: entry.created_by,
      created_at: entry.created_at,
      lines: entry.lines.map((l) => ({
        id: l.id,
        account_code: l.glAccount.account_code,
        account_name: l.glAccount.name,
        account_type: l.glAccount.account_type,
        debit_amount: Number(l.debit_amount),
        credit_amount: Number(l.credit_amount),
        description: l.description,
      })),
    },
    error: null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const firmIds = await getAccountantFirmIds(session.user.id);

  const body = await request.json();
  const { action } = body as { action: 'reverse' };

  if (action !== 'reverse') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  // Verify access
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    select: { firm_id: true },
  });
  if (!entry || (firmIds && !firmIds.includes(entry.firm_id))) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  try {
    const reversal = await reverseJournalEntry(id, session.user.id);
    return NextResponse.json({
      data: { id: reversal.id, voucher_number: reversal.voucher_number },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reverse';
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
