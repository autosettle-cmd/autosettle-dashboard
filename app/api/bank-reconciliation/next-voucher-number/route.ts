import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET — get next payment voucher number for a firm
// Pattern: PV-{NNN} — per-firm sequence
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

    const existing = await prisma.invoice.findMany({
      where: { firm_id: firmId, invoice_number: { startsWith: 'PV-' } },
      select: { invoice_number: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    let maxNum = 0;
    for (const inv of existing) {
      const m = inv.invoice_number?.match(/PV-(\d+)/);
      if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    }

    const nextNumber = `PV-${String(maxNum + 1).padStart(3, '0')}`;
    return NextResponse.json({ data: nextNumber, error: null });
  } catch (error) {
    console.error('Error generating voucher number:', error);
    return NextResponse.json({ data: null, error: 'Failed to generate voucher number' }, { status: 500 });
  }
}
