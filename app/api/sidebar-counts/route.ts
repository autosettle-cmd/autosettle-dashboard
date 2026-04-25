import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/** Consolidated sidebar badge counts — replaces 3 separate API calls */
export async function GET(request: NextRequest) {
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

  return NextResponse.json({
    data: { claimPending, receiptPending, mileagePending, receivedPending, issuedPending: 0, employeesPending },
    error: null,
  });
}
