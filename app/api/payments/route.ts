import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { recalcInvoicePayment } from '@/lib/payment-utils';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();

  const { supplier_id, amount, payment_date, reference, notes, allocations, claim_ids } = body as {
    supplier_id: string;
    amount: number;
    payment_date: string;
    reference?: string;
    notes?: string;
    allocations: { invoice_id: string; amount: number }[];
    claim_ids?: string[];
  };

  if (!supplier_id || !amount || !payment_date || !allocations?.length) {
    return NextResponse.json({ data: null, error: 'Missing required fields' }, { status: 400 });
  }

  // Verify supplier access
  const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { firm_id: true } });
  if (!supplier || (firmIds && !firmIds.includes(supplier.firm_id))) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
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
      if (!receipt || !firmIds || !firmIds.includes(receipt.firm_id) || receipt.type !== 'receipt') {
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

  return NextResponse.json({ data: payment, error: null });
}

export async function GET(request: NextRequest) {
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

  const payments = await prisma.payment.findMany({
    where,
    include: {
      supplier: { select: { name: true } },
      receipts: { include: { claim: { select: { id: true, receipt_number: true, merchant: true, thumbnail_url: true } } } },
      allocations: {
        include: { invoice: { select: { invoice_number: true, vendor_name_raw: true } } },
      },
    },
    orderBy: { payment_date: 'desc' },
  });

  const data = payments.map((p) => ({
    id: p.id,
    supplier_name: p.supplier.name,
    amount: p.amount.toString(),
    payment_date: p.payment_date,
    reference: p.reference,
    notes: p.notes,
    receipts: p.receipts.map((r) => ({
      id: r.claim.id,
      receipt_number: r.claim.receipt_number,
      merchant: r.claim.merchant,
      thumbnail_url: r.claim.thumbnail_url,
    })),
    allocations: p.allocations.map((a) => ({
      invoice_id: a.invoice_id,
      invoice_number: a.invoice.invoice_number,
      vendor_name: a.invoice.vendor_name_raw,
      amount: a.amount.toString(),
    })),
  }));

  return NextResponse.json({ data, error: null });
}
