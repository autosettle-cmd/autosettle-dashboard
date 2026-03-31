import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    include: {
      aliases: { select: { id: true, alias: true, is_confirmed: true } },
      _count: { select: { invoices: true } },
      invoices: {
        where: { payment_status: { not: 'paid' } },
        select: { total_amount: true, amount_paid: true, due_date: true },
      },
      payments: {
        select: {
          amount: true,
          allocations: { select: { amount: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const now = new Date();
  const data = suppliers.map((s) => {
    const outstanding = s.invoices.reduce(
      (sum, inv) => sum + (Number(inv.total_amount) - Number(inv.amount_paid)), 0
    );
    const overdueAmount = s.invoices
      .filter((inv) => inv.due_date && inv.due_date < now)
      .reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.amount_paid)), 0);
    const totalPayments = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalAllocated = s.payments.reduce(
      (sum, p) => sum + p.allocations.reduce((s2, a) => s2 + Number(a.amount), 0), 0
    );
    const creditBalance = Math.max(0, totalPayments - totalAllocated);

    return {
      id: s.id,
      name: s.name,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
      notes: s.notes,
      is_active: s.is_active,
      aliases: s.aliases,
      invoice_count: s._count.invoices,
      total_outstanding: outstanding.toFixed(2),
      overdue_amount: overdueAmount.toFixed(2),
      credit_balance: creditBalance.toFixed(2),
    };
  });

  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ data: null, error: 'Supplier name is required' }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({
    data: {
      firm_id: firmId,
      name: body.name.trim(),
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json({ data: supplier, error: null });
}
