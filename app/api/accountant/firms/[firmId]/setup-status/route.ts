import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { firmId } = await params;
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
  }

  const [firm, glCount, fyCount, adminCount] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { name: true, registration_number: true, contact_email: true },
    }),
    prisma.gLAccount.count({ where: { firm_id: firmId } }),
    prisma.fiscalYear.count({ where: { firm_id: firmId } }),
    prisma.user.count({ where: { firm_id: firmId, role: 'admin' } }),
  ]);

  if (!firm) {
    return NextResponse.json({ data: null, error: 'Firm not found' }, { status: 404 });
  }

  const firmMissing: string[] = [];
  if (!firm.name?.trim()) firmMissing.push('name');
  if (!firm.registration_number?.trim()) firmMissing.push('registration_number');
  if (!firm.contact_email?.trim()) firmMissing.push('contact_email');

  return NextResponse.json({
    data: {
      firmDetails: { complete: firmMissing.length === 0, missing: firmMissing },
      chartOfAccounts: { complete: glCount > 0, count: glCount },
      fiscalYear: { complete: fyCount > 0, count: fyCount },
      admin: { complete: adminCount > 0, count: adminCount },
    },
    error: null,
  });
}
