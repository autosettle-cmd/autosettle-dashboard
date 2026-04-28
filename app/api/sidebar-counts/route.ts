import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/** Consolidated sidebar badge counts — replaces 3 separate API calls */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role === 'employee') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const role = session.user.role;
    const { searchParams } = new URL(request.url);
    const selectedFirmId = searchParams.get('firmId');

    // Build firm scope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scope: any;
    if (role === 'admin') {
      if (!session.user.firm_id) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
      scope = { firm_id: session.user.firm_id };
    } else {
      const firmIds = await getAccountantFirmIds(session.user.id);
      scope = firmScope(firmIds, selectedFirmId);
    }

    const [claimPending, receiptPending, mileagePending, receivedPending, employeesPending] = await Promise.all([
      prisma.claim.count({ where: { ...scope, type: 'claim', approval: 'pending_approval' } }),
      prisma.claim.count({ where: { ...scope, type: 'receipt', approval: 'pending_approval' } }),
      prisma.claim.count({ where: { ...scope, type: 'mileage', approval: 'pending_approval' } }),
      prisma.invoice.count({ where: { ...scope, approval: 'pending_approval' } }),
      prisma.user.count({ where: { ...scope, status: 'pending_onboarding', role: 'employee' } }),
    ]);

    // Count firms with incomplete setup (accountant only)
    let clientsSetupPending = 0;
    if (role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firmWhere: any = { is_active: true };
      if (firmIds) firmWhere.id = { in: firmIds };

      const firms = await prisma.firm.findMany({
        where: firmWhere,
        select: {
          id: true,
          default_trade_payables_gl_id: true,
          default_staff_claims_gl_id: true,
          _count: { select: { glAccounts: true, fiscalYears: true } },
        },
      });

      // Count category GL mappings per firm
      const categoryMappings = await prisma.categoryFirmOverride.groupBy({
        by: ['firm_id'],
        where: { firm_id: { in: firms.map(f => f.id) }, gl_account_id: { not: null } },
        _count: true,
      });
      const catMapCount = new Map(categoryMappings.map(c => [c.firm_id, c._count]));

      for (const f of firms) {
        const hasCoa = f._count.glAccounts > 0;
        const hasFy = f._count.fiscalYears > 0;
        const hasGlDefaults = !!f.default_trade_payables_gl_id && !!f.default_staff_claims_gl_id;
        const hasCatMappings = (catMapCount.get(f.id) ?? 0) > 0;
        if (!hasCoa || !hasFy || !hasGlDefaults || !hasCatMappings) {
          clientsSetupPending++;
        }
      }
    }

    return NextResponse.json({
      data: { claimPending, receiptPending, mileagePending, receivedPending, issuedPending: 0, employeesPending, clientsSetupPending },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
