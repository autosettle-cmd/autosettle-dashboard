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
  const { id: supplierId } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, contact_email: true, contact_phone: true, firm_id: true },
  });
  if (!supplier || (firmIds && !firmIds.includes(supplier.firm_id))) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const from = dateFrom ? new Date(dateFrom) : new Date(0);
  const to = dateTo ? new Date(dateTo) : new Date();
  to.setHours(23, 59, 59, 999);

  const [invoicesBefore, paymentsBefore] = await Promise.all([
    prisma.invoice.aggregate({
      where: { supplier_id: supplierId, issue_date: { lt: from } },
      _sum: { total_amount: true },
    }),
    prisma.payment.aggregate({
      where: { supplier_id: supplierId, payment_date: { lt: from } },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance = Number(invoicesBefore._sum.total_amount ?? 0) - Number(paymentsBefore._sum.amount ?? 0);

  const invoices = await prisma.invoice.findMany({
    where: { supplier_id: supplierId, issue_date: { gte: from, lte: to } },
    select: { id: true, invoice_number: true, issue_date: true, total_amount: true, vendor_name_raw: true },
    orderBy: { issue_date: 'asc' },
  });

  const payments = await prisma.payment.findMany({
    where: { supplier_id: supplierId, payment_date: { gte: from, lte: to } },
    select: { id: true, reference: true, payment_date: true, amount: true, notes: true },
    orderBy: { payment_date: 'asc' },
  });

  type Entry = { date: string; type: 'invoice' | 'payment'; reference: string; description: string; debit: number; credit: number; balance: number };
  const entries: Entry[] = [];

  for (const inv of invoices) {
    entries.push({
      date: inv.issue_date.toISOString(),
      type: 'invoice',
      reference: inv.invoice_number ?? '-',
      description: `Purchase — ${inv.vendor_name_raw}`,
      debit: Number(inv.total_amount),
      credit: 0,
      balance: 0,
    });
  }

  for (const pmt of payments) {
    entries.push({
      date: pmt.payment_date.toISOString(),
      type: 'payment',
      reference: pmt.reference ?? '-',
      description: pmt.notes ? `Payment — ${pmt.notes}` : 'Payment',
      debit: 0,
      credit: Number(pmt.amount),
      balance: 0,
    });
  }

  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    return a.type === 'invoice' ? -1 : 1;
  });

  let balance = openingBalance;
  for (const entry of entries) {
    balance += entry.debit - entry.credit;
    entry.balance = balance;
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return NextResponse.json({
    data: {
      supplier: { id: supplier.id, name: supplier.name, contact_email: supplier.contact_email, contact_phone: supplier.contact_phone },
      period: { from: from.toISOString(), to: to.toISOString() },
      opening_balance: openingBalance,
      entries,
      totals: { total_debit: totalDebit, total_credit: totalCredit },
      closing_balance: balance,
    },
    error: null,
  });
}
