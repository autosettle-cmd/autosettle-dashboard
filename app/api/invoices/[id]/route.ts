import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const firmIds = await getAccountantFirmIds(session.user.id);
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { firm_id: true },
  });

  if (!invoice) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }
  if (firmIds && !firmIds.includes(invoice.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (body.vendor_name_raw !== undefined) data.vendor_name_raw = body.vendor_name_raw;
  if (body.invoice_number !== undefined) data.invoice_number = body.invoice_number || null;
  if (body.issue_date !== undefined) data.issue_date = new Date(body.issue_date);
  if (body.due_date !== undefined) data.due_date = body.due_date ? new Date(body.due_date) : null;
  if (body.payment_terms !== undefined) data.payment_terms = body.payment_terms || null;
  if (body.subtotal !== undefined) data.subtotal = body.subtotal;
  if (body.tax_amount !== undefined) data.tax_amount = body.tax_amount;
  if (body.total_amount !== undefined) data.total_amount = body.total_amount;
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.amount_paid !== undefined) {
    data.amount_paid = body.amount_paid;
    const totalAmount = body.total_amount ?? (await prisma.invoice.findUnique({ where: { id }, select: { total_amount: true } }))?.total_amount;
    if (totalAmount) {
      const paid = Number(body.amount_paid);
      const total = Number(totalAmount);
      if (paid >= total) data.payment_status = 'paid';
      else if (paid > 0) data.payment_status = 'partially_paid';
      else data.payment_status = 'unpaid';
    }
  }
  if (body.payment_status !== undefined) data.payment_status = body.payment_status;
  if (body.status !== undefined) data.status = body.status;

  if (body.supplier_id !== undefined) {
    data.supplier_id = body.supplier_id;
    data.supplier_link_status = 'confirmed';

    const inv = await prisma.invoice.findUnique({ where: { id }, select: { vendor_name_raw: true } });
    if (inv) {
      const normalizedVendor = inv.vendor_name_raw.toLowerCase().trim();
      await prisma.supplierAlias.upsert({
        where: { supplier_id_alias: { supplier_id: body.supplier_id, alias: normalizedVendor } },
        update: { is_confirmed: true },
        create: { supplier_id: body.supplier_id, alias: normalizedVendor, is_confirmed: true },
      });
    }
  }
  if (body.supplier_link_status !== undefined) data.supplier_link_status = body.supplier_link_status;

  const updated = await prisma.invoice.update({ where: { id }, data });
  return NextResponse.json({ data: updated, error: null });
}
