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
        _count: { select: { invoices: true, salesInvoices: true } },
      },
      orderBy: { name: 'asc' },
      take: takeParam || 100,
    }),
    prisma.supplier.count({ where }),
  ]);

  const supplierIds = suppliers.map(s => s.id);

  // Batch aggregate queries instead of fetching all invoice/payment rows
  const [outstandingBySupplier, overdueBySupplier, creditBySupplier, receivableBySupplier] = supplierIds.length > 0
    ? await Promise.all([
        prisma.invoice.groupBy({
          by: ['supplier_id'],
          where: { supplier_id: { in: supplierIds }, payment_status: { not: 'paid' } },
          _sum: { total_amount: true, amount_paid: true },
        }),
        prisma.invoice.groupBy({
          by: ['supplier_id'],
          where: { supplier_id: { in: supplierIds }, payment_status: { not: 'paid' }, due_date: { lt: new Date() } },
          _sum: { total_amount: true, amount_paid: true },
        }),
        prisma.$queryRaw<Array<{ supplier_id: string; credit_balance: number }>>`
          SELECT
            p.supplier_id,
            GREATEST(0, SUM(p.amount) - COALESCE(SUM(pa_sum.allocated), 0)) as credit_balance
          FROM "Payment" p
          LEFT JOIN (
            SELECT pa.payment_id, SUM(pa.amount) as allocated
            FROM "PaymentAllocation" pa
            GROUP BY pa.payment_id
          ) pa_sum ON pa_sum.payment_id = p.id
          WHERE p.supplier_id = ANY(${supplierIds})
          GROUP BY p.supplier_id
        `,
        prisma.salesInvoice.groupBy({
          by: ['supplier_id'],
          where: { supplier_id: { in: supplierIds }, payment_status: { not: 'paid' } },
          _sum: { total_amount: true, amount_paid: true },
        }),
      ])
    : [[], [], [], []];

  const outstandingMap = new Map(outstandingBySupplier.map(r => [
    r.supplier_id!, Number(r._sum.total_amount ?? 0) - Number(r._sum.amount_paid ?? 0),
  ]));
  const overdueMap = new Map(overdueBySupplier.map(r => [
    r.supplier_id!, Number(r._sum.total_amount ?? 0) - Number(r._sum.amount_paid ?? 0),
  ]));
  const creditMap = new Map(creditBySupplier.map(r => [r.supplier_id, Number(r.credit_balance)]));
  const receivableMap = new Map(receivableBySupplier.map(r => [
    r.supplier_id!, Number(r._sum.total_amount ?? 0) - Number(r._sum.amount_paid ?? 0),
  ]));

  const data = suppliers.map((s) => ({
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
    sales_invoice_count: s._count.salesInvoices,
    total_outstanding: (outstandingMap.get(s.id) ?? 0).toFixed(2),
    overdue_amount: (overdueMap.get(s.id) ?? 0).toFixed(2),
    credit_balance: (creditMap.get(s.id) ?? 0).toFixed(2),
    receivable_amount: (receivableMap.get(s.id) ?? 0).toFixed(2),
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
  }));

  return NextResponse.json({ data, error: null, hasMore: totalCount > (takeParam || 100), totalCount });
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
