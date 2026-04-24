import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/match-voucher
 * Find a payment voucher (PV-) that matches the given vendor + amount.
 * Used during normal invoice upload to detect if a PV already exists.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmId = request.nextUrl.searchParams.get('firmId');
  const vendorName = request.nextUrl.searchParams.get('vendorName')?.trim();
  const totalAmountStr = request.nextUrl.searchParams.get('totalAmount');

  if (!firmId || !totalAmountStr) {
    return NextResponse.json({ data: null, error: 'firmId and totalAmount are required' }, { status: 400 });
  }

  // Auth check
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
    }
  } else if (session.user.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  const totalAmount = parseFloat(totalAmountStr);
  if (isNaN(totalAmount)) {
    return NextResponse.json({ data: null, error: 'Invalid totalAmount' }, { status: 400 });
  }

  // Search for PV- invoices with no file, matching amount (within RM 0.01)
  const candidates = await prisma.invoice.findMany({
    where: {
      firm_id: firmId,
      file_url: null,
      invoice_number: { startsWith: 'PV-' },
      total_amount: { gte: totalAmount - 0.01, lte: totalAmount + 0.01 },
    },
    select: {
      id: true,
      invoice_number: true,
      vendor_name_raw: true,
      total_amount: true,
      issue_date: true,
    },
    orderBy: { created_at: 'desc' },
    take: 10,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ data: { match: null }, error: null });
  }

  // If vendor name provided, prefer matching vendor
  if (vendorName) {
    const vendorLower = vendorName.toLowerCase();
    const vendorMatch = candidates.find(c =>
      c.vendor_name_raw.toLowerCase().includes(vendorLower) ||
      vendorLower.includes(c.vendor_name_raw.toLowerCase())
    );
    if (vendorMatch) {
      return NextResponse.json({ data: { match: vendorMatch }, error: null });
    }
  }

  // Return the first (most recent) match by amount
  return NextResponse.json({ data: { match: candidates[0] }, error: null });
}
