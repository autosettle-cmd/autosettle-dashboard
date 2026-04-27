import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET — get next receipt number for a firm
// Pattern: OR-{year}-{NNN} — per-firm per-year sequence
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const firmId = request.nextUrl.searchParams.get('firmId');
    if (!firmId) {
      return NextResponse.json({ data: null, error: 'firmId required' }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const prefix = `OR-${year}-`;

    const existing = await prisma.salesInvoice.findMany({
      where: { firm_id: firmId, invoice_number: { startsWith: prefix } },
      select: { invoice_number: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    let maxNum = 0;
    for (const inv of existing) {
      const seq = parseInt(inv.invoice_number.replace(prefix, ''), 10);
      if (seq > maxNum) maxNum = seq;
    }

    const nextNumber = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
    return NextResponse.json({ data: nextNumber, error: null });
  } catch (error) {
    console.error('Error generating receipt number:', error);
    return NextResponse.json({ data: null, error: 'Failed to generate receipt number' }, { status: 500 });
  }
}
