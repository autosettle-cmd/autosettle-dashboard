import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET — list invoice links for a receipt (claim)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const claimId = request.nextUrl.searchParams.get('claimId');
    if (!claimId) {
      return NextResponse.json({ data: null, error: 'claimId is required' }, { status: 400 });
    }

    const links = await prisma.invoiceReceiptLink.findMany({
      where: { claim_id: claimId },
      select: {
        id: true,
        invoice_id: true,
        amount: true,
        linked_at: true,
        invoice: {
          select: {
            invoice_number: true,
            vendor_name_raw: true,
            total_amount: true,
            issue_date: true,
          },
        },
      },
      orderBy: { linked_at: 'desc' },
    });

    return NextResponse.json({
      data: links.map(l => ({
        id: l.id,
        invoice_id: l.invoice_id,
        amount: Number(l.amount),
        invoice_number: l.invoice.invoice_number,
        vendor_name: l.invoice.vendor_name_raw,
        total_amount: Number(l.invoice.total_amount),
        issue_date: l.invoice.issue_date,
      })),
      error: null,
    });
  } catch (error) {
    console.error('Error fetching receipt-invoice links:', error);
    return NextResponse.json({ data: null, error: 'Failed to fetch links' }, { status: 500 });
  }
}
