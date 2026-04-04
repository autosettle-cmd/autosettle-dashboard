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
  const supplierId = searchParams.get('supplierId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const paymentStatus = searchParams.get('paymentStatus');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };

  if (supplierId) where.supplier_id = supplierId;
  if (dateFrom || dateTo) {
    where.issue_date = {};
    if (dateFrom) where.issue_date.gte = new Date(dateFrom);
    if (dateTo) where.issue_date.lte = new Date(dateTo);
  }
  if (paymentStatus && paymentStatus !== 'all') where.payment_status = paymentStatus;
  if (search) {
    where.OR = [
      { invoice_number: { contains: search, mode: 'insensitive' } },
      { buyer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [salesInvoices, totalCount] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true } },
        items: { orderBy: { sort_order: 'asc' } },
        paymentAllocations: {
          select: { id: true, amount: true },
        },
      },
      orderBy: { issue_date: 'desc' },
      take: takeParam || 500,
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  const data = salesInvoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    currency: inv.currency,
    subtotal: inv.subtotal.toString(),
    tax_amount: inv.tax_amount.toString(),
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    payment_status: inv.payment_status,
    notes: inv.notes,
    supplier_id: inv.supplier_id,
    buyer_name: inv.buyer.name,
    lhdn_status: inv.lhdn_status,
    items: inv.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity.toString(),
      unit_price: item.unit_price.toString(),
      discount: item.discount.toString(),
      tax_type: item.tax_type,
      tax_rate: item.tax_rate.toString(),
      tax_amount: item.tax_amount.toString(),
      line_total: item.line_total.toString(),
      sort_order: item.sort_order,
    })),
    created_at: inv.created_at,
  }));

  return NextResponse.json({ data, error: null, hasMore: totalCount > (takeParam || 500), totalCount });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const employeeId = session.user.employee_id;

  try {
    const body = await request.json();

    const { supplier_id, invoice_number, issue_date, due_date, currency, notes, items } = body;

    if (!supplier_id || !invoice_number || !issue_date || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { data: null, error: 'Missing required fields: supplier_id, invoice_number, issue_date, items[]' },
        { status: 400 }
      );
    }

    // Verify buyer belongs to this firm
    const buyer = await prisma.supplier.findUnique({
      where: { id: supplier_id },
      select: { firm_id: true },
    });
    if (!buyer || buyer.firm_id !== firmId) {
      return NextResponse.json(
        { data: null, error: 'Buyer not found in your firm' },
        { status: 404 }
      );
    }

    // Calculate totals from items
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of items) {
      subtotal += parseFloat(item.line_total) || 0;
      taxAmount += parseFloat(item.tax_amount) || 0;
    }
    const totalAmount = subtotal + taxAmount;

    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        firm_id: firmId,
        supplier_id,
        created_by: employeeId || null,
        invoice_number,
        issue_date: new Date(issue_date),
        due_date: due_date ? new Date(due_date) : null,
        currency: currency || 'MYR',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_status: 'unpaid',
        amount_paid: 0,
        notes: notes || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unit_price: number; discount?: number; tax_type?: string; tax_rate?: number; tax_amount?: number; line_total: number; sort_order?: number }, idx: number) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount || 0,
            tax_type: item.tax_type || null,
            tax_rate: item.tax_rate || 0,
            tax_amount: item.tax_amount || 0,
            line_total: item.line_total,
            sort_order: item.sort_order ?? idx,
          })),
        },
      },
      include: {
        buyer: { select: { id: true, name: true } },
        items: { orderBy: { sort_order: 'asc' } },
      },
    });

    const data = {
      id: salesInvoice.id,
      invoice_number: salesInvoice.invoice_number,
      issue_date: salesInvoice.issue_date,
      due_date: salesInvoice.due_date,
      currency: salesInvoice.currency,
      subtotal: salesInvoice.subtotal.toString(),
      tax_amount: salesInvoice.tax_amount.toString(),
      total_amount: salesInvoice.total_amount.toString(),
      amount_paid: salesInvoice.amount_paid.toString(),
      payment_status: salesInvoice.payment_status,
      notes: salesInvoice.notes,
      supplier_id: salesInvoice.supplier_id,
      buyer_name: salesInvoice.buyer.name,
      items: salesInvoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity.toString(),
        unit_price: item.unit_price.toString(),
        discount: item.discount.toString(),
        tax_type: item.tax_type,
        tax_rate: item.tax_rate.toString(),
        tax_amount: item.tax_amount.toString(),
        line_total: item.line_total.toString(),
        sort_order: item.sort_order,
      })),
      created_at: salesInvoice.created_at,
    };

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating sales invoice:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to create sales invoice' },
      { status: 500 }
    );
  }
}
