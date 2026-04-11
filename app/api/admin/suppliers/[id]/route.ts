import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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
        include: {
          category: { select: { name: true } },
          paymentAllocations: {
            include: {
              payment: {
                select: {
                  id: true, payment_date: true, reference: true, amount: true,
                  receipts: { select: { payment_id: true, claim_id: true } },
                },
              },
            },
          },
        },
        orderBy: { issue_date: 'desc' },
      },
      salesInvoices: {
        include: {
          paymentAllocations: {
            include: {
              payment: {
                select: { id: true, payment_date: true, reference: true, amount: true },
              },
            },
          },
        },
        orderBy: { issue_date: 'desc' },
      },
    },
  });

  if (!supplier || supplier.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  // Batch-fetch all claim details referenced by payment receipts
  const allClaimIds = supplier.invoices.flatMap((inv) =>
    inv.paymentAllocations.flatMap((a) => a.payment.receipts.map((r) => r.claim_id))
  );
  const claimMap = new Map<string, { id: string; merchant: string; receipt_number: string | null }>();
  if (allClaimIds.length > 0) {
    const claims = await prisma.claim.findMany({
      where: { id: { in: Array.from(new Set(allClaimIds)) } },
      select: { id: true, merchant: true, receipt_number: true },
    });
    for (const c of claims) claimMap.set(c.id, c);
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
    vendor_name_raw: inv.vendor_name_raw,
    description: inv.payment_terms,
    file_url: inv.file_url,
    thumbnail_url: inv.thumbnail_url,
    confidence: inv.confidence,
    allocations: inv.paymentAllocations.map((a) => ({
      id: a.id,
      amount: a.amount.toString(),
      payment_date: a.payment.payment_date,
      reference: a.payment.reference,
      receipts: a.payment.receipts.map((r) => {
        const c = claimMap.get(r.claim_id);
        return {
          id: c?.id ?? r.claim_id,
          merchant: c?.merchant ?? '',
          receipt_number: c?.receipt_number ?? null,
        };
      }),
    })),
  }));

  const salesInvoices = supplier.salesInvoices.map((sinv) => ({
    id: sinv.id,
    invoice_number: sinv.invoice_number,
    issue_date: sinv.issue_date,
    due_date: sinv.due_date,
    total_amount: sinv.total_amount.toString(),
    amount_paid: sinv.amount_paid.toString(),
    payment_status: sinv.payment_status,
    notes: sinv.notes,
    allocations: sinv.paymentAllocations.map((a) => ({
      id: a.id,
      amount: a.amount.toString(),
      payment_date: a.payment.payment_date,
      reference: a.payment.reference,
    })),
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

  const updated = await prisma.supplier.update({ where: { id }, data });
  return NextResponse.json({ data: updated, error: null });
}
