import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { recalcInvoicePayment, recalcClaimPayment } from '@/lib/payment-utils';
import { auditLog } from '@/lib/audit';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();

  const { supplier_id, employee_id, amount, payment_date, reference, notes, allocations, sales_allocations, claim_allocations, claim_ids, direction } = body as {
    supplier_id?: string;
    employee_id?: string;
    amount: number;
    payment_date: string;
    reference?: string;
    notes?: string;
    allocations?: { invoice_id: string; amount: number }[];
    sales_allocations?: { invoice_id: string; amount: number }[];
    claim_allocations?: { claim_id: string; amount: number }[];
    claim_ids?: string[];
    direction?: 'outgoing' | 'incoming';
  };

  // ── Employee claim payment ──
  if (employee_id && claim_allocations?.length) {
    if (!amount || !payment_date) {
      return NextResponse.json({ data: null, error: 'Missing required fields' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employee_id }, select: { firm_id: true, name: true } });
    if (!employee || (firmIds && !firmIds.includes(employee.firm_id))) {
      return NextResponse.json({ data: null, error: 'Employee not found' }, { status: 404 });
    }

    const allocTotal = claim_allocations.reduce((s, a) => s + a.amount, 0);
    if (allocTotal > amount + 0.01) {
      return NextResponse.json({ data: null, error: 'Allocations exceed payment amount' }, { status: 400 });
    }

    for (const alloc of claim_allocations) {
      const claim = await prisma.claim.findUnique({
        where: { id: alloc.claim_id },
        select: { amount: true, amount_paid: true, approval: true, firm_id: true, type: true },
      });
      if (!claim || (firmIds && !firmIds.includes(claim.firm_id)) || claim.type !== 'claim') {
        return NextResponse.json({ data: null, error: 'Claim not found' }, { status: 404 });
      }
      if (claim.approval !== 'approved') {
        return NextResponse.json({ data: null, error: 'Claim not approved' }, { status: 400 });
      }
      const outstanding = Number(claim.amount) - Number(claim.amount_paid);
      if (alloc.amount > outstanding + 0.01) {
        return NextResponse.json({ data: null, error: `Allocation exceeds outstanding for claim` }, { status: 400 });
      }
    }

    const payment = await prisma.payment.create({
      data: {
        firm_id: employee.firm_id,
        employee_id,
        amount,
        payment_date: new Date(payment_date),
        reference: reference || null,
        notes: notes || null,
        direction: 'outgoing',
        receipts: {
          create: claim_allocations.map(a => ({ claim_id: a.claim_id, amount: a.amount })),
        },
      },
      include: { receipts: true },
    });

    for (const alloc of claim_allocations) {
      await recalcClaimPayment(alloc.claim_id);
    }

    await auditLog({
      firmId: employee.firm_id,
      tableName: 'Payment',
      recordId: payment.id,
      action: 'create',
      newValues: { direction: 'outgoing', amount: String(amount), employee_id, reference: reference || null, claims: claim_allocations.map(a => a.claim_id) },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: payment, error: null });
  }

  const dir = direction ?? 'outgoing';
  const hasAllocations = dir === 'outgoing' ? allocations?.length : sales_allocations?.length;

  if (!supplier_id || !amount || !payment_date || !hasAllocations) {
    return NextResponse.json({ data: null, error: 'Missing required fields' }, { status: 400 });
  }

  // Verify supplier access
  const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { firm_id: true } });
  if (!supplier || (firmIds && !firmIds.includes(supplier.firm_id))) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  if (dir === 'incoming' && sales_allocations?.length) {
    // ── Incoming payment (customer pays on sales invoices) ──
    const allocTotal = sales_allocations.reduce((s, a) => s + a.amount, 0);
    if (allocTotal > amount + 0.01) {
      return NextResponse.json({ data: null, error: 'Allocations exceed payment amount' }, { status: 400 });
    }

    for (const alloc of sales_allocations) {
      const inv = await prisma.invoice.findUnique({
        where: { id: alloc.invoice_id },
        select: { total_amount: true, amount_paid: true, firm_id: true, type: true },
      });
      if (!inv || (firmIds && !firmIds.includes(inv.firm_id)) || inv.type !== 'sales') {
        return NextResponse.json({ data: null, error: `Sales invoice not found` }, { status: 404 });
      }
      const balance = Number(inv.total_amount) - Number(inv.amount_paid);
      if (alloc.amount > balance + 0.01) {
        return NextResponse.json({ data: null, error: `Allocation exceeds balance for sales invoice` }, { status: 400 });
      }
    }

    // Validate receipt links if provided
    if (claim_ids?.length) {
      for (const cid of claim_ids) {
        const receipt = await prisma.claim.findUnique({
          where: { id: cid },
          select: { firm_id: true, type: true, paymentReceipts: { take: 1 } },
        });
        if (!receipt || (firmIds && !firmIds.includes(receipt.firm_id)) || receipt.type !== 'receipt') {
          return NextResponse.json({ data: null, error: 'Receipt not found' }, { status: 404 });
        }
        if (receipt.paymentReceipts.length > 0) {
          return NextResponse.json({ data: null, error: 'Receipt already linked to another payment' }, { status: 400 });
        }
      }
    }

    const payment = await prisma.payment.create({
      data: {
        firm_id: supplier.firm_id,
        supplier_id,
        amount,
        payment_date: new Date(payment_date),
        reference: reference || null,
        notes: notes || null,
        direction: 'incoming',
        allocations: {
          create: sales_allocations.map((a) => ({
            invoice_id: a.invoice_id,
            amount: a.amount,
          })),
        },
        receipts: claim_ids?.length ? {
          create: claim_ids.map((cid) => ({ claim_id: cid })),
        } : undefined,
      },
      include: { allocations: true },
    });

    // Mark receipts as paid
    if (claim_ids?.length) {
      await prisma.claim.updateMany({ where: { id: { in: claim_ids } }, data: { payment_status: 'paid' } });
    }

    for (const alloc of sales_allocations) {
      await recalcInvoicePayment(alloc.invoice_id);
    }

    await auditLog({
      firmId: supplier.firm_id,
      tableName: 'Payment',
      recordId: payment.id,
      action: 'create',
      newValues: { direction: 'incoming', amount: String(amount), supplier_id, reference: reference || null },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: payment, error: null });
  }

  // ── Outgoing payment (existing flow) ──
  if (!allocations?.length) {
    return NextResponse.json({ data: null, error: 'Missing allocations' }, { status: 400 });
  }

  const allocTotal = allocations.reduce((s, a) => s + a.amount, 0);
  if (allocTotal > amount + 0.01) {
    return NextResponse.json({ data: null, error: 'Allocations exceed payment amount' }, { status: 400 });
  }

  for (const alloc of allocations) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: alloc.invoice_id },
      select: { total_amount: true, amount_paid: true, firm_id: true },
    });
    if (!invoice || (firmIds && !firmIds.includes(invoice.firm_id))) {
      return NextResponse.json({ data: null, error: `Invoice ${alloc.invoice_id} not found` }, { status: 404 });
    }
    const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
    if (alloc.amount > balance + 0.01) {
      return NextResponse.json({ data: null, error: `Allocation exceeds balance for invoice ${alloc.invoice_id}` }, { status: 400 });
    }
  }

  // Validate receipt links if provided
  if (claim_ids?.length) {
    for (const cid of claim_ids) {
      const receipt = await prisma.claim.findUnique({
        where: { id: cid },
        select: { firm_id: true, type: true, paymentReceipts: { take: 1 } },
      });
      if (!receipt || (firmIds && !firmIds.includes(receipt.firm_id)) || receipt.type !== 'receipt') {
        return NextResponse.json({ data: null, error: 'Receipt not found' }, { status: 404 });
      }
      if (receipt.paymentReceipts.length > 0) {
        return NextResponse.json({ data: null, error: 'Receipt already linked to another payment' }, { status: 400 });
      }
    }
  }

  const payment = await prisma.payment.create({
    data: {
      firm_id: supplier.firm_id,
      supplier_id,
      amount,
      payment_date: new Date(payment_date),
      reference: reference || null,
      notes: notes || null,
      direction: 'outgoing',
      allocations: {
        create: allocations.map((a) => ({
          invoice_id: a.invoice_id,
          amount: a.amount,
        })),
      },
      receipts: claim_ids?.length ? {
        create: claim_ids.map((cid) => ({ claim_id: cid })),
      } : undefined,
    },
    include: { allocations: true },
  });

  // Mark receipts as paid
  if (claim_ids?.length) {
    await prisma.claim.updateMany({ where: { id: { in: claim_ids } }, data: { payment_status: 'paid' } });
  }

  for (const alloc of allocations) {
    await recalcInvoicePayment(alloc.invoice_id);
  }

  await auditLog({
    firmId: supplier.firm_id,
    tableName: 'Payment',
    recordId: payment.id,
    action: 'create',
    newValues: { direction: 'outgoing', amount: String(amount), supplier_id, reference: reference || null, invoices: allocations.map((a) => a.invoice_id) },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ data: payment, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplierId');
  const firmId = searchParams.get('firmId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };
  if (supplierId) where.supplier_id = supplierId;
  if (dateFrom || dateTo) {
    where.payment_date = {};
    if (dateFrom) where.payment_date.gte = new Date(dateFrom);
    if (dateTo) where.payment_date.lte = new Date(dateTo);
  }

  const direction = searchParams.get('direction');
  if (direction) where.direction = direction;

  const payments = await prisma.payment.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      employee: { select: { name: true } },
      receipts: { select: { payment_id: true, claim_id: true } },
      allocations: {
        include: { invoice: { select: { invoice_number: true, vendor_name_raw: true, type: true, supplier: { select: { name: true } } } } },
      },
    },
    orderBy: { payment_date: 'desc' },
    take: DEFAULT_PAGE_SIZE,
  });

  // Batch-fetch claim details for all receipts in one query
  const allClaimIds = payments.flatMap((p) => p.receipts.map((r) => r.claim_id));
  const claimMap = new Map<string, { id: string; receipt_number: string | null; merchant: string; thumbnail_url: string | null }>();
  if (allClaimIds.length > 0) {
    const claims = await prisma.claim.findMany({
      where: { id: { in: allClaimIds } },
      select: { id: true, receipt_number: true, merchant: true, thumbnail_url: true },
    });
    for (const c of claims) claimMap.set(c.id, c);
  }

  const data = payments.map((p) => ({
    id: p.id,
    direction: p.direction,
    supplier_name: p.supplier?.name ?? p.employee?.name ?? 'Unknown',
    amount: p.amount.toString(),
    payment_date: p.payment_date,
    reference: p.reference,
    notes: p.notes,
    receipts: p.receipts.map((r) => {
      const c = claimMap.get(r.claim_id);
      return {
        id: c?.id ?? r.claim_id,
        receipt_number: c?.receipt_number ?? null,
        merchant: c?.merchant ?? '',
        thumbnail_url: c?.thumbnail_url ?? null,
      };
    }),
    allocations: p.allocations.filter((a) => a.invoice.type === 'purchase').map((a) => ({
      invoice_id: a.invoice_id,
      invoice_number: a.invoice.invoice_number,
      vendor_name: a.invoice.vendor_name_raw,
      amount: a.amount.toString(),
    })),
    sales_allocations: p.allocations.filter((a) => a.invoice.type === 'sales').map((a) => ({
      invoice_id: a.invoice_id,
      invoice_number: a.invoice.invoice_number,
      buyer_name: a.invoice.supplier?.name ?? '',
      amount: a.amount.toString(),
    })),
  }));

  return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
