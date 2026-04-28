import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Returns outstanding invoices and claims for bank recon matching.
 * - direction=outgoing (DEBIT): supplier invoices + reviewed employee claims
 * - direction=incoming (CREDIT): sales invoices
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const firmId = searchParams.get('firmId');
    const direction = searchParams.get('direction'); // 'outgoing' | 'incoming'
    const amount = searchParams.get('amount') ? parseFloat(searchParams.get('amount')!) : null;
    const search = searchParams.get('search')?.trim() || null;

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
      const invoiceWhere: Record<string, unknown> = {
        firm_id: firmId,
        approval: 'approved',
        payment_status: { in: ['unpaid', 'partially_paid'] },
      };
      if (search) {
        // Check if search looks like an amount (number with optional decimals)
        const searchAmount = parseFloat(search);
        const isAmountSearch = !isNaN(searchAmount) && /^\d+\.?\d*$/.test(search.trim());
        if (isAmountSearch) {
          // Amount prefix match — find invoices where remaining amount starts with the search digits
          invoiceWhere.total_amount = { gte: searchAmount, lt: searchAmount < 1 ? searchAmount + 1 : searchAmount * 10 < searchAmount + 10 ? searchAmount + 10 : Math.pow(10, Math.ceil(Math.log10(searchAmount + 1))) };
        } else {
          invoiceWhere.OR = [
            { vendor_name_raw: { contains: search, mode: 'insensitive' } },
            { invoice_number: { contains: search, mode: 'insensitive' } },
            { supplier: { name: { contains: search, mode: 'insensitive' } } },
          ];
        }
      }
      const invoices = await prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          invoice_number: true,
          vendor_name_raw: true,
          total_amount: true,
          amount_paid: true,
          issue_date: true,
          supplier_id: true,
          gl_account_id: true,
          file_url: true,
        },
        orderBy: { issue_date: 'desc' },
        take: DEFAULT_PAGE_SIZE,
      });

      // 2. Reviewed employee claims not yet reimbursed
      const claimWhere: Record<string, unknown> = {
        firm_id: firmId,
        status: 'reviewed',
        payment_status: 'unpaid',
        type: { in: ['claim', 'mileage'] },
        bankTxnAllocations: { none: {} },
      };
      if (search) {
        const searchAmount = parseFloat(search);
        const isAmountSearch = !isNaN(searchAmount) && /^\d+\.?\d*$/.test(search.trim());
        if (isAmountSearch) {
          claimWhere.amount = { gte: searchAmount, lt: searchAmount < 1 ? searchAmount + 1 : searchAmount * 10 < searchAmount + 10 ? searchAmount + 10 : Math.pow(10, Math.ceil(Math.log10(searchAmount + 1))) };
        } else {
          claimWhere.OR = [
            { merchant: { contains: search, mode: 'insensitive' } },
            { receipt_number: { contains: search, mode: 'insensitive' } },
            { employee: { name: { contains: search, mode: 'insensitive' } } },
            { category: { name: { contains: search, mode: 'insensitive' } } },
          ];
        }
      }
      const claims = await prisma.claim.findMany({
        where: claimWhere,
        select: {
          id: true,
          claim_date: true,
          merchant: true,
          amount: true,
          receipt_number: true,
          category: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          gl_account_id: true,
          file_url: true,
          thumbnail_url: true,
        },
        orderBy: { claim_date: 'desc' },
        take: DEFAULT_PAGE_SIZE,
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
        fileUrl: inv.file_url,
      }));

      const claimItems = claims.map(c => ({
        type: 'claim' as const,
        id: c.id,
        reference: c.receipt_number,
        name: `${c.employee.name} — ${c.merchant}`,
        employeeId: c.employee.id,
        employeeName: c.employee.name,
        merchant: c.merchant,
        totalAmount: Number(c.amount),
        remaining: Number(c.amount),
        date: c.claim_date,
        categoryId: c.category.id,
        categoryName: c.category.name,
        glAccountId: c.gl_account_id,
        fileUrl: c.file_url,
        thumbnailUrl: c.thumbnail_url,
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
      const salesWhere: Record<string, unknown> = {
        firm_id: firmId,
        type: 'sales',
        approval: 'approved',
        payment_status: { in: ['unpaid', 'partially_paid'] },
      };
      if (search) {
        const searchAmount = parseFloat(search);
        const isAmountSearch = !isNaN(searchAmount) && /^\d+\.?\d*$/.test(search.trim());
        if (isAmountSearch) {
          salesWhere.total_amount = { gte: searchAmount, lt: searchAmount < 1 ? searchAmount + 1 : searchAmount * 10 < searchAmount + 10 ? searchAmount + 10 : Math.pow(10, Math.ceil(Math.log10(searchAmount + 1))) };
        } else {
          salesWhere.OR = [
            { supplier: { name: { contains: search, mode: 'insensitive' } } },
            { invoice_number: { contains: search, mode: 'insensitive' } },
          ];
        }
      }
      const salesInvoices = await prisma.invoice.findMany({
        where: salesWhere,
        select: {
          id: true,
          invoice_number: true,
          total_amount: true,
          amount_paid: true,
          issue_date: true,
          supplier_id: true,
          gl_account_id: true,
          supplier: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: DEFAULT_PAGE_SIZE,
      });

      const items = salesInvoices.map(inv => ({
        type: 'sales_invoice' as const,
        id: inv.id,
        reference: inv.invoice_number,
        name: inv.supplier?.name ?? 'Unknown', // customer/buyer name
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
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
