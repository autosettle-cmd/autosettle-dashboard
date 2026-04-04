import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [suppliers, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: {
        firm: { select: { name: true } },
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
      take: takeParam || 500,
    }),
    prisma.supplier.count({ where }),
  ]);

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
      firm_name: s.firm.name,
      firm_id: s.firm_id,
      aliases: s.aliases,
      invoice_count: s._count.invoices,
      total_outstanding: outstanding.toFixed(2),
      overdue_amount: overdueAmount.toFixed(2),
      credit_balance: creditBalance.toFixed(2),
      // LHDN buyer fields
      tin: s.tin,
      brn: s.brn,
      sst_registration_number: s.sst_registration_number,
      address_line1: s.address_line1,
      address_line2: s.address_line2,
      city: s.city,
      postal_code: s.postal_code,
      state: s.state,
      country: s.country,
    };
  });

  return NextResponse.json({ data, error: null, hasMore: totalCount > 500, totalCount });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ data: null, error: 'Supplier name is required' }, { status: 400 });
  }
  if (!body.firm_id) {
    return NextResponse.json({ data: null, error: 'Firm ID is required' }, { status: 400 });
  }
  // Verify accountant has access to this firm
  if (firmIds && !firmIds.includes(body.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
  }

  const supplier = await prisma.supplier.create({
    data: {
      firm_id: body.firm_id,
      name: body.name.trim(),
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json({ data: supplier, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
