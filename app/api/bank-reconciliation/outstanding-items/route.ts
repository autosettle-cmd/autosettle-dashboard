import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/**
 * Returns outstanding invoices and claims for bank recon matching.
 * - direction=outgoing (DEBIT): supplier invoices + reviewed employee claims
 * - direction=incoming (CREDIT): sales invoices
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const direction = searchParams.get('direction'); // 'outgoing' | 'incoming'
  const amount = searchParams.get('amount') ? parseFloat(searchParams.get('amount')!) : null;

  if (!firmId) {
    return NextResponse.json({ data: null, error: 'firmId required' }, { status: 400 });
  }

  // Verify access
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Unauthorized for this firm' }, { status: 403 });
    }
  } else if (session.user.role === 'admin' && session.user.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Unauthorized for this firm' }, { status: 403 });
  }

  if (direction === 'outgoing') {
    // DEBIT = money going out → show supplier invoices + employee claims

    // 1. Unpaid/partially paid supplier invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        firm_id: firmId,
        approval: 'approved',
        payment_status: { in: ['unpaid', 'partially_paid'] },
      },
      select: {
        id: true,
        invoice_number: true,
        vendor_name_raw: true,
        total_amount: true,
        amount_paid: true,
        issue_date: true,
        supplier_id: true,
        gl_account_id: true,
      },
      orderBy: { issue_date: 'desc' },
      take: 100,
    });

    // 2. Reviewed employee claims not yet reimbursed
    const claims = await prisma.claim.findMany({
      where: {
        firm_id: firmId,
        status: 'reviewed',
        payment_status: 'unpaid',
        type: { in: ['claim', 'mileage'] },
      },
      select: {
        id: true,
        claim_date: true,
        merchant: true,
        amount: true,
        receipt_number: true,
        category: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        gl_account_id: true,
      },
      orderBy: { claim_date: 'desc' },
      take: 100,
    });

    // Sort by closest amount match if amount provided
    const invoiceItems = invoices.map(inv => ({
      type: 'invoice' as const,
      id: inv.id,
      reference: inv.invoice_number,
      name: inv.vendor_name_raw,
      totalAmount: Number(inv.total_amount),
      remaining: Number(inv.total_amount) - Number(inv.amount_paid),
      date: inv.issue_date,
      supplierId: inv.supplier_id,
      glAccountId: inv.gl_account_id,
    }));

    const claimItems = claims.map(c => ({
      type: 'claim' as const,
      id: c.id,
      reference: c.receipt_number,
      name: `${c.employee.name} — ${c.merchant}`,
      employeeName: c.employee.name,
      merchant: c.merchant,
      totalAmount: Number(c.amount),
      remaining: Number(c.amount),
      date: c.claim_date,
      categoryId: c.category.id,
      categoryName: c.category.name,
      glAccountId: c.gl_account_id,
    }));

    // Sort by amount proximity if amount provided
    const allItems = [...invoiceItems, ...claimItems];
    if (amount) {
      allItems.sort((a, b) => Math.abs(a.remaining - amount) - Math.abs(b.remaining - amount));
    }

    return NextResponse.json({ data: allItems, error: null });
  }

  if (direction === 'incoming') {
    // CREDIT = money coming in → show sales invoices
    const salesInvoices = await prisma.salesInvoice.findMany({
      where: {
        firm_id: firmId,
        approval: 'approved',
        payment_status: { in: ['unpaid', 'partially_paid'] },
      },
      select: {
        id: true,
        invoice_number: true,
        total_amount: true,
        amount_paid: true,
        issue_date: true,
        supplier_id: true,
        gl_account_id: true,
        buyer: { select: { name: true } },
      },
      orderBy: { issue_date: 'desc' },
      take: 100,
    });

    const items = salesInvoices.map(inv => ({
      type: 'sales_invoice' as const,
      id: inv.id,
      reference: inv.invoice_number,
      name: inv.buyer.name, // buyer name
      totalAmount: Number(inv.total_amount),
      remaining: Number(inv.total_amount) - Number(inv.amount_paid),
      date: inv.issue_date,
      supplierId: inv.supplier_id,
      glAccountId: inv.gl_account_id,
    }));

    if (amount) {
      items.sort((a, b) => Math.abs(a.remaining - amount) - Math.abs(b.remaining - amount));
    }

    return NextResponse.json({ data: items, error: null });
  }

  return NextResponse.json({ data: [], error: null });
}
