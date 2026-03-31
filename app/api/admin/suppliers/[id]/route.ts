import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      aliases: { orderBy: { created_at: 'asc' } },
      invoices: {
        include: { category: { select: { name: true } } },
        orderBy: { issue_date: 'desc' },
      },
    },
  });

  if (!supplier || supplier.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  const invoices = supplier.invoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    payment_status: inv.payment_status,
    status: inv.status,
    category_name: inv.category.name,
    supplier_link_status: inv.supplier_link_status,
  }));

  return NextResponse.json({
    data: {
      id: supplier.id,
      name: supplier.name,
      contact_email: supplier.contact_email,
      contact_phone: supplier.contact_phone,
      notes: supplier.notes,
      is_active: supplier.is_active,
      aliases: supplier.aliases,
      invoices,
    },
    error: null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { firm_id: true },
  });
  if (!supplier || supplier.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  const body = await request.json();

  // Merge suppliers
  if (body.merge_with_id) {
    const target = await prisma.supplier.findUnique({
      where: { id: body.merge_with_id },
      select: { firm_id: true },
    });
    if (!target || target.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Target supplier not found' }, { status: 404 });
    }

    // Move all invoices and aliases to the target supplier
    await prisma.$transaction([
      prisma.invoice.updateMany({
        where: { supplier_id: id },
        data: { supplier_id: body.merge_with_id },
      }),
      // Move aliases that don't conflict
      prisma.$executeRaw`
        INSERT INTO "SupplierAlias" (id, supplier_id, alias, is_confirmed, created_at)
        SELECT gen_random_uuid(), ${body.merge_with_id}, alias, is_confirmed, NOW()
        FROM "SupplierAlias" WHERE supplier_id = ${id}
        ON CONFLICT (supplier_id, alias) DO NOTHING
      `,
      prisma.supplierAlias.deleteMany({ where: { supplier_id: id } }),
      prisma.supplier.delete({ where: { id } }),
    ]);

    return NextResponse.json({ data: { merged: true }, error: null });
  }

  // Normal update
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.contact_email !== undefined) data.contact_email = body.contact_email || null;
  if (body.contact_phone !== undefined) data.contact_phone = body.contact_phone || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.is_active !== undefined) data.is_active = body.is_active;

  const updated = await prisma.supplier.update({ where: { id }, data });
  return NextResponse.json({ data: updated, error: null });
}
