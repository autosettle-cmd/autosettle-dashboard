import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recalcInvoicePayment } from '@/lib/payment-utils';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const { supplier_id } = await request.json();

  if (!supplier_id) {
    return NextResponse.json({ data: null, error: 'supplier_id required' }, { status: 400 });
  }

  // Verify supplier belongs to firm
  const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { firm_id: true } });
  if (!supplier || supplier.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  // Get all payments with their allocations
  const payments = await prisma.payment.findMany({
    where: { supplier_id },
    include: { allocations: { select: { amount: true } } },
    orderBy: { payment_date: 'asc' },
  });

  // Calculate unallocated per payment
  const paymentsWithCredit = payments
    .map((p) => {
      const allocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
      return { id: p.id, unallocated: Number(p.amount) - allocated };
    })
    .filter((p) => p.unallocated > 0.005);

  const totalCredit = paymentsWithCredit.reduce((s, p) => s + p.unallocated, 0);
  if (totalCredit < 0.01) {
    return NextResponse.json({ data: { applied: 0, remaining: 0 }, error: null });
  }

  // Get unpaid invoices for this supplier, oldest first
  const invoices = await prisma.invoice.findMany({
    where: { supplier_id, payment_status: { not: 'paid' } },
    select: { id: true, total_amount: true, amount_paid: true },
    orderBy: { issue_date: 'asc' },
  });

  if (invoices.length === 0) {
    return NextResponse.json({ data: { applied: 0, remaining: totalCredit }, error: null });
  }

  // Allocate credit: walk through payments with credit, distribute to invoices
  let totalApplied = 0;
  let invoiceIdx = 0;
  const invoiceBalances = invoices.map((inv) => ({
    id: inv.id,
    balance: Number(inv.total_amount) - Number(inv.amount_paid),
    allocated: 0,
  }));
  const allocationsToCreate: { payment_id: string; invoice_id: string; amount: number }[] = [];

  for (const payment of paymentsWithCredit) {
    let remaining = payment.unallocated;

    while (remaining > 0.005 && invoiceIdx < invoiceBalances.length) {
      const inv = invoiceBalances[invoiceIdx];
      const needed = inv.balance - inv.allocated;
      if (needed <= 0.005) { invoiceIdx++; continue; }

      const alloc = Math.min(remaining, needed);
      allocationsToCreate.push({ payment_id: payment.id, invoice_id: inv.id, amount: alloc });
      inv.allocated += alloc;
      remaining -= alloc;
      totalApplied += alloc;

      if (inv.balance - inv.allocated < 0.005) invoiceIdx++;
    }

    if (invoiceIdx >= invoiceBalances.length) break;
  }

  // Create all allocations
  if (allocationsToCreate.length > 0) {
    // Group by payment_id + invoice_id in case of duplicates (shouldn't happen but safe)
    for (const alloc of allocationsToCreate) {
      // Check if allocation already exists for this payment+invoice pair
      const existing = await prisma.paymentAllocation.findUnique({
        where: { payment_id_invoice_id: { payment_id: alloc.payment_id, invoice_id: alloc.invoice_id } },
      });
      if (existing) {
        await prisma.paymentAllocation.update({
          where: { id: existing.id },
          data: { amount: Number(existing.amount) + alloc.amount },
        });
      } else {
        await prisma.paymentAllocation.create({ data: alloc });
      }
    }

    // Recalc each affected invoice
    const affectedInvoiceIds = Array.from(new Set(allocationsToCreate.map((a) => a.invoice_id)));
    for (const invId of affectedInvoiceIds) {
      await recalcInvoicePayment(invId);
    }
  }

  return NextResponse.json({
    data: { applied: totalApplied, remaining: totalCredit - totalApplied },
    error: null,
  });
}
