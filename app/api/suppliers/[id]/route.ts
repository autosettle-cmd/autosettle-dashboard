import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function verifyAccess(session: { user: { id: string; role: string } }, supplierId: string) {
  const firmIds = await getAccountantFirmIds(session.user.id);
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { firm_id: true },
  });
  if (!supplier) return null;
  if (firmIds && !firmIds.includes(supplier.firm_id)) return null;
  return supplier;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const access = await verifyAccess(session, id);
    if (!access) {
      return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
    }

    // Parallel queries instead of deep nested includes
    const [supplierBase, invoicesRaw, salesInvoicesRaw] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id },
        include: {
          firm: { select: { name: true } },
          aliases: { orderBy: { created_at: 'asc' } },
        },
      }),
      prisma.invoice.findMany({
        where: { supplier_id: id, type: 'purchase' },
        include: {
          category: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: DEFAULT_PAGE_SIZE,
      }),
      prisma.invoice.findMany({
        where: { supplier_id: id, type: 'sales' },
        select: {
          id: true, invoice_number: true, issue_date: true, due_date: true,
          total_amount: true, amount_paid: true, payment_status: true, notes: true,
        },
        orderBy: { issue_date: 'desc' },
        take: DEFAULT_PAGE_SIZE,
      }),
    ]);
    const supplier = supplierBase;

    if (!supplier) {
      return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
    }

    const invoices = invoicesRaw.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_amount: inv.total_amount.toString(),
      amount_paid: inv.amount_paid.toString(),
      payment_status: inv.payment_status,
      status: inv.status,
      category_name: inv.category?.name ?? '',
      supplier_link_status: inv.supplier_link_status,
      vendor_name_raw: inv.vendor_name_raw,
      description: inv.payment_terms,
      file_url: inv.file_url,
      thumbnail_url: inv.thumbnail_url,
      confidence: inv.confidence,
      allocations: [],
    }));

    const salesInvoices = salesInvoicesRaw.map((sinv) => ({
      id: sinv.id,
      invoice_number: sinv.invoice_number,
      issue_date: sinv.issue_date,
      due_date: sinv.due_date,
      total_amount: sinv.total_amount.toString(),
      amount_paid: sinv.amount_paid.toString(),
      payment_status: sinv.payment_status,
      notes: sinv.notes,
      allocations: [],
    }));

    // Find orphaned payments (no allocations = unallocated credit)
    const orphanedPayments = await prisma.payment.findMany({
      where: {
        supplier_id: id,
        allocations: { none: {} },
      },
      select: {
        id: true, amount: true, payment_date: true, reference: true, notes: true,
        receipts: { select: { claim_id: true, claim: { select: { merchant: true, receipt_number: true } } } },
      },
      orderBy: { payment_date: 'desc' },
    });

    return NextResponse.json({
      data: {
        id: supplier.id,
        name: supplier.name,
        contact_email: supplier.contact_email,
        contact_phone: supplier.contact_phone,
        notes: supplier.notes,
        is_active: supplier.is_active,
        firm_name: supplier.firm.name,
        aliases: supplier.aliases,
        invoices,
        salesInvoices,
        orphanedPayments: orphanedPayments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          payment_date: p.payment_date,
          reference: p.reference,
          notes: p.notes,
          receipts: p.receipts.map((r) => ({
            claim_id: r.claim_id,
            merchant: r.claim.merchant,
            receipt_number: r.claim.receipt_number,
          })),
        })),
        // LHDN buyer fields
        tin: supplier.tin,
        brn: supplier.brn,
        sst_registration_number: supplier.sst_registration_number,
        address_line1: supplier.address_line1,
        address_line2: supplier.address_line2,
        city: supplier.city,
        postal_code: supplier.postal_code,
        state: supplier.state,
        country: supplier.country,
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const access = await verifyAccess(session, id);
    if (!access) {
      return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
    }

    const body = await request.json();
    const firmIds = await getAccountantFirmIds(session.user.id);

    // Merge suppliers
    if (body.merge_with_id) {
      const target = await prisma.supplier.findUnique({
        where: { id: body.merge_with_id },
        select: { firm_id: true },
      });
      if (!target || (firmIds && !firmIds.includes(target.firm_id))) {
        return NextResponse.json({ data: null, error: 'Target supplier not found' }, { status: 404 });
      }

      await prisma.$transaction([
        prisma.invoice.updateMany({
          where: { supplier_id: id },
          data: { supplier_id: body.merge_with_id },
        }),
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

    // LHDN buyer fields
    if (body.tin !== undefined) data.tin = body.tin || null;
    if (body.brn !== undefined) data.brn = body.brn || null;
    if (body.sst_registration_number !== undefined) data.sst_registration_number = body.sst_registration_number || null;
    if (body.address_line1 !== undefined) data.address_line1 = body.address_line1 || null;
    if (body.address_line2 !== undefined) data.address_line2 = body.address_line2 || null;
    if (body.city !== undefined) data.city = body.city || null;
    if (body.postal_code !== undefined) data.postal_code = body.postal_code || null;
    if (body.state !== undefined) data.state = body.state || null;
    if (body.country !== undefined) data.country = body.country || null;

    // GL account defaults
    if (body.default_gl_account_id !== undefined) data.default_gl_account_id = body.default_gl_account_id || null;
    if (body.default_contra_gl_account_id !== undefined) data.default_contra_gl_account_id = body.default_contra_gl_account_id || null;

    const updated = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const access = await verifyAccess(session, id);
    if (!access) {
      return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
    }

    // Check for downstream links
    const [invoiceCount, paymentCount] = await Promise.all([
      prisma.invoice.count({ where: { supplier_id: id } }),
      prisma.payment.count({ where: { supplier_id: id } }),
    ]);

    const hasLinks = invoiceCount > 0 || paymentCount > 0;

    if (hasLinks) {
      const links: string[] = [];
      if (invoiceCount > 0) links.push(`${invoiceCount} invoice(s)`);
      if (paymentCount > 0) links.push(`${paymentCount} payment(s)`);
      return NextResponse.json({
        data: null,
        error: `Cannot delete supplier — linked to ${links.join(', ')}. Remove or reassign linked records first.`,
      }, { status: 409 });
    }

    // Hard delete — no downstream links, safe to remove
    await prisma.$transaction([
      prisma.supplierAlias.deleteMany({ where: { supplier_id: id } }),
      prisma.supplier.delete({ where: { id } }),
    ]);

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
