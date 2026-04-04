import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

async function verifyAccess(session: { user: { id: string; role: string } }, salesInvoiceId: string) {
  const firmIds = await getAccountantFirmIds(session.user.id);
  const salesInvoice = await prisma.salesInvoice.findUnique({
    where: { id: salesInvoiceId },
    select: { firm_id: true },
  });
  if (!salesInvoice) return null;
  if (firmIds && !firmIds.includes(salesInvoice.firm_id)) return null;
  return salesInvoice;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const access = await verifyAccess(session, id);
  if (!access) {
    return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
  }

  const salesInvoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true } },
      firm: { select: { name: true } },
      creator: { select: { id: true, name: true } },
      items: { orderBy: { sort_order: 'asc' } },
      paymentAllocations: {
        select: { id: true, amount: true },
      },
    },
  });

  if (!salesInvoice) {
    return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
  }

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
    buyer_id: salesInvoice.buyer.id,
    firm_name: salesInvoice.firm.name,
    firm_id: salesInvoice.firm_id,
    creator_name: salesInvoice.creator?.name ?? null,
    lhdn_status: salesInvoice.lhdn_status,
    lhdn_submission_uid: salesInvoice.lhdn_submission_uid,
    lhdn_document_uuid: salesInvoice.lhdn_document_uuid,
    lhdn_long_id: salesInvoice.lhdn_long_id,
    lhdn_qr_url: salesInvoice.lhdn_qr_url,
    lhdn_submitted_at: salesInvoice.lhdn_submitted_at,
    lhdn_validated_at: salesInvoice.lhdn_validated_at,
    lhdn_error: salesInvoice.lhdn_error,
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
    paymentAllocations: salesInvoice.paymentAllocations.map((a) => ({
      id: a.id,
      amount: a.amount.toString(),
    })),
    created_at: salesInvoice.created_at,
    updated_at: salesInvoice.updated_at,
  };

  return NextResponse.json({ data, error: null });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const access = await verifyAccess(session, id);
  if (!access) {
    return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
  }

  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.supplier_id !== undefined) data.supplier_id = body.supplier_id;
  if (body.invoice_number !== undefined) data.invoice_number = body.invoice_number;
  if (body.issue_date !== undefined) data.issue_date = new Date(body.issue_date);
  if (body.due_date !== undefined) data.due_date = body.due_date ? new Date(body.due_date) : null;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.payment_status !== undefined) data.payment_status = body.payment_status;
  if (body.amount_paid !== undefined) data.amount_paid = parseFloat(body.amount_paid);

  // If items are provided, replace all items and recalculate totals
  if (body.items && Array.isArray(body.items)) {
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of body.items) {
      subtotal += parseFloat(item.line_total) || 0;
      taxAmount += parseFloat(item.tax_amount) || 0;
    }
    data.subtotal = subtotal;
    data.tax_amount = taxAmount;
    data.total_amount = subtotal + taxAmount;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.salesInvoiceItem.deleteMany({ where: { sales_invoice_id: id } });
      return tx.salesInvoice.update({
        where: { id },
        data: {
          ...data,
          items: {
            create: body.items.map((item: { description: string; quantity: number; unit_price: number; discount?: number; tax_type?: string; tax_rate?: number; tax_amount?: number; line_total: number; sort_order?: number }, idx: number) => ({
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
          firm: { select: { name: true } },
          items: { orderBy: { sort_order: 'asc' } },
        },
      });
    });

    return NextResponse.json({ data: {
      ...updated,
      subtotal: updated.subtotal.toString(),
      tax_amount: updated.tax_amount.toString(),
      total_amount: updated.total_amount.toString(),
      amount_paid: updated.amount_paid.toString(),
      buyer_name: updated.buyer.name,
      firm_name: updated.firm.name,
      items: updated.items.map((item) => ({
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
    }, error: null });
  }

  // Simple field update (no items)
  const updated = await prisma.salesInvoice.update({
    where: { id },
    data,
    include: {
      buyer: { select: { id: true, name: true } },
      firm: { select: { name: true } },
    },
  });

  return NextResponse.json({ data: {
    ...updated,
    subtotal: updated.subtotal.toString(),
    tax_amount: updated.tax_amount.toString(),
    total_amount: updated.total_amount.toString(),
    amount_paid: updated.amount_paid.toString(),
    buyer_name: updated.buyer.name,
    firm_name: updated.firm.name,
  }, error: null });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const access = await verifyAccess(session, id);
  if (!access) {
    return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
  }

  await prisma.salesInvoice.delete({ where: { id } });

  return NextResponse.json({ data: { deleted: true }, error: null });
}
