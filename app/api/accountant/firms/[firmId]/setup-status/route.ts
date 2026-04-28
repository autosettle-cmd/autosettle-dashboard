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
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { firmId } = await params;
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
    }

    const [firm, glCount, fyCount, adminCount, categoryCount] = await Promise.all([
      prisma.firm.findUnique({
        where: { id: firmId },
        select: {
          name: true, registration_number: true, contact_email: true,
          default_trade_payables_gl_id: true, default_staff_claims_gl_id: true,
          default_trade_receivables_gl_id: true, default_retained_earnings_gl_id: true,
        },
      }),
      prisma.gLAccount.count({ where: { firm_id: firmId } }),
      prisma.fiscalYear.count({ where: { firm_id: firmId } }),
      prisma.user.count({ where: { firm_id: firmId, role: 'admin' } }),
      // Count categories with GL mappings (via CategoryFirmOverride)
      prisma.categoryFirmOverride.count({ where: { firm_id: firmId, gl_account_id: { not: null } } }),
    ]);

    if (!firm) {
      return NextResponse.json({ data: null, error: 'Firm not found' }, { status: 404 });
    }

    const firmMissing: string[] = [];
    if (!firm.name?.trim()) firmMissing.push('name');
    if (!firm.registration_number?.trim()) firmMissing.push('registration_number');
    if (!firm.contact_email?.trim()) firmMissing.push('contact_email');

    // GL defaults — at minimum Trade Payables and Staff Claims must be set
    const glDefaultsMissing: string[] = [];
    if (!firm.default_trade_payables_gl_id) glDefaultsMissing.push('Trade Payables');
    if (!firm.default_staff_claims_gl_id) glDefaultsMissing.push('Staff Claims Payable');

    return NextResponse.json({
      data: {
        firmDetails: { complete: firmMissing.length === 0, missing: firmMissing },
        chartOfAccounts: { complete: glCount > 0, count: glCount },
        glDefaults: { complete: glDefaultsMissing.length === 0, missing: glDefaultsMissing },
        categories: { complete: categoryCount > 0, count: categoryCount },
        fiscalYear: { complete: fyCount > 0, count: fyCount },
        admin: { complete: adminCount > 0, count: adminCount, optional: true },
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
