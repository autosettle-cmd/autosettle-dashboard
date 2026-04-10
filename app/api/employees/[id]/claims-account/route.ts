import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id: employeeId } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, phone: true, email: true, firm_id: true },
  });
  if (!employee || (firmIds && !firmIds.includes(employee.firm_id))) {
    return NextResponse.json({ data: null, error: 'Employee not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const from = dateFrom ? new Date(dateFrom) : new Date(0);
  const to = dateTo ? new Date(dateTo) : new Date();
  to.setHours(23, 59, 59, 999);

  // ── Opening balance: approved claims - payments before period ──
  const [claimsBefore, paymentsBefore] = await Promise.all([
    prisma.claim.aggregate({
      where: { employee_id: employeeId, approval: 'approved', type: 'claim', claim_date: { lt: from } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { employee_id: employeeId, direction: 'outgoing', payment_date: { lt: from } },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance =
    Number(claimsBefore._sum.amount ?? 0)
    - Number(paymentsBefore._sum.amount ?? 0);

  // ── Entries in period ──
  const [claims, payments] = await Promise.all([
    prisma.claim.findMany({
      where: { employee_id: employeeId, approval: 'approved', type: 'claim', claim_date: { gte: from, lte: to } },
      select: { id: true, description: true, merchant: true, claim_date: true, amount: true, amount_paid: true, payment_status: true, category: { select: { name: true } } },
      orderBy: { claim_date: 'asc' },
    }),
    prisma.payment.findMany({
      where: { employee_id: employeeId, direction: 'outgoing', payment_date: { gte: from, lte: to } },
      select: { id: true, reference: true, payment_date: true, amount: true, notes: true },
      orderBy: { payment_date: 'asc' },
    }),
  ]);

  type Entry = { date: string; type: string; reference: string; description: string; debit: number; credit: number; balance: number; id: string };
  const entries: Entry[] = [];

  for (const claim of claims) {
    entries.push({
      id: claim.id,
      date: claim.claim_date.toISOString(),
      type: 'claim',
      reference: claim.category.name,
      description: `${claim.category.name} — ${claim.merchant}`,
      debit: 0,
      credit: Number(claim.amount),
      balance: 0,
    });
  }

  for (const pmt of payments) {
    entries.push({
      id: pmt.id,
      date: pmt.payment_date.toISOString(),
      type: 'payment',
      reference: pmt.reference ?? '-',
      description: pmt.notes ? `Payment — ${pmt.notes}` : 'Payment',
      debit: Number(pmt.amount),
      credit: 0,
      balance: 0,
    });
  }

  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    if (a.type === 'claim' && b.type === 'payment') return -1;
    if (a.type === 'payment' && b.type === 'claim') return 1;
    return 0;
  });

  let balance = openingBalance;
  for (const entry of entries) {
    balance += entry.credit - entry.debit;
    entry.balance = balance;
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return NextResponse.json({
    data: {
      employee: { id: employee.id, name: employee.name, phone: employee.phone, email: employee.email },
      period: { from: from.toISOString(), to: to.toISOString() },
      opening_balance: openingBalance,
      entries,
      totals: { total_debit: totalDebit, total_credit: totalCredit },
      closing_balance: balance,
      unpaid_claims: claims.filter(c => c.payment_status !== 'paid').length,
      total_unpaid: claims.filter(c => c.payment_status !== 'paid').reduce((s, c) => s + Number(c.amount) - Number(c.amount_paid), 0),
    },
    error: null,
  });
}
