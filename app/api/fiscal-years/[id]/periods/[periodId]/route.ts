import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; periodId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { id, periodId } = await params;

    // Verify fiscal year exists and belongs to accountant's firm
    const fy = await prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) {
      return NextResponse.json({ data: null, error: 'Fiscal year not found' }, { status: 404 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(fy.firm_id)) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
    }

    // Verify period belongs to this fiscal year
    const period = await prisma.period.findUnique({ where: { id: periodId } });
    if (!period || period.fiscal_year_id !== id) {
      return NextResponse.json({ data: null, error: 'Period not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['open', 'closed', 'locked'].includes(status)) {
      return NextResponse.json({ data: null, error: 'status must be "open", "closed", or "locked"' }, { status: 400 });
    }

    // Prevent reopening a locked period
    if (period.status === 'locked' && status !== 'locked') {
      return NextResponse.json({ data: null, error: 'Cannot reopen a locked period' }, { status: 400 });
    }

    const updated = await prisma.period.update({
      where: { id: periodId },
      data: { status },
    });

    await auditLog({
      firmId: fy.firm_id,
      tableName: 'Period',
      recordId: periodId,
      action: 'update',
      oldValues: { status: period.status },
      newValues: { status: updated.status },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
