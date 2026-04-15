import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET — get next receipt number for a supplier/name
// Pattern: OR-{PREFIX}-{NNN} where PREFIX is derived from supplier name
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const supplierName = request.nextUrl.searchParams.get('name')?.trim();
    const firmId = request.nextUrl.searchParams.get('firmId');
    if (!supplierName || !firmId) {
      return NextResponse.json({ data: null, error: 'name and firmId required' }, { status: 400 });
    }

    // Generate prefix from supplier name: first word, uppercase, max 10 chars
    const prefix = supplierName.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'OR';
    const pattern = `OR-${prefix}-`;

    // Search SalesInvoice invoice_number for existing receipt numbers with this pattern
    const existing = await prisma.salesInvoice.findMany({
      where: {
        firm_id: firmId,
        invoice_number: { startsWith: pattern },
      },
      select: { invoice_number: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    // Also check legacy bank transaction notes for backwards compat
    const legacyTxns = await prisma.bankTransaction.findMany({
      where: {
        bankStatement: { firm_id: firmId },
        notes: { contains: pattern },
        recon_status: 'manually_matched',
      },
      select: { notes: true },
      take: 200,
    });

    // Extract highest number from both sources
    let maxNum = 0;
    const regex = new RegExp(`OR-${prefix}-(\\d+)`);

    for (const inv of existing) {
      const match = inv.invoice_number.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    for (const txn of legacyTxns) {
      const match = txn.notes?.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    const nextNumber = `OR-${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
    return NextResponse.json({ data: nextNumber, error: null });
  } catch (error) {
    console.error('Error generating receipt number:', error);
    return NextResponse.json({ data: null, error: 'Failed to generate receipt number' }, { status: 500 });
  }
}
