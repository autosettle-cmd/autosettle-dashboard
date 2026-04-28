import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

interface AccountRow {
  account_code: string;
  name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  normal_balance: 'Debit' | 'Credit';
  parent_code: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { firmId, accounts } = body as { firmId: string; accounts: AccountRow[] };

    if (!firmId || !Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json({ data: null, error: 'firmId and accounts[] are required' }, { status: 400 });
    }

    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
    }

    // Block if firm already has GL accounts
    const existingCount = await prisma.gLAccount.count({ where: { firm_id: firmId } });
    if (existingCount > 0) {
      return NextResponse.json({ data: null, error: `Firm already has ${existingCount} GL accounts.` }, { status: 400 });
    }

    // Validate account types
    const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    const validBalances = ['Debit', 'Credit'];
    for (const a of accounts) {
      if (!a.account_code?.trim() || !a.name?.trim()) {
        return NextResponse.json({ data: null, error: `Account code and name are required for all entries` }, { status: 400 });
      }
      if (!validTypes.includes(a.account_type)) {
        return NextResponse.json({ data: null, error: `Invalid account type "${a.account_type}" for ${a.account_code}` }, { status: 400 });
      }
      if (!validBalances.includes(a.normal_balance)) {
        return NextResponse.json({ data: null, error: `Invalid normal balance "${a.normal_balance}" for ${a.account_code}` }, { status: 400 });
      }
    }

    // Pass 1: Create all accounts without parents
    const codeToId: Record<string, string> = {};
    let created = 0;

    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i];
      const account = await prisma.gLAccount.create({
        data: {
          firm_id: firmId,
          account_code: a.account_code.trim(),
          name: a.name.trim(),
          account_type: a.account_type,
          normal_balance: a.normal_balance,
          is_active: true,
          is_system: false,
          sort_order: i,
        },
      });
      codeToId[a.account_code.trim()] = account.id;
      created++;
    }

    // Pass 2: Link parents by code
    for (const a of accounts) {
      if (a.parent_code?.trim() && codeToId[a.parent_code.trim()]) {
        await prisma.gLAccount.update({
          where: { id: codeToId[a.account_code.trim()] },
          data: { parent_id: codeToId[a.parent_code.trim()] },
        });
      }
    }

    // Set firm GL defaults if standard codes found
    const defaults: Record<string, string> = {};
    if (codeToId['211-001']) defaults.default_trade_payables_gl_id = codeToId['211-001'];
    if (codeToId['214-000']) defaults.default_staff_claims_gl_id = codeToId['214-000'];
    if (codeToId['320-000']) defaults.default_retained_earnings_gl_id = codeToId['320-000'];

    if (Object.keys(defaults).length > 0) {
      await prisma.firm.update({ where: { id: firmId }, data: defaults });
    }

    // Create default tax codes
    const existingTaxCodes = await prisma.taxCode.count({ where: { firm_id: firmId } });
    let taxCodesCreated = 0;

    if (existingTaxCodes === 0) {
      const SST_DEFAULTS = [
        { code: 'SR-6', description: 'Standard Rate SST 6%', rate: 6.00, tax_type: 'SST', inputGl: '115-000', outputGl: '213-000' },
        { code: 'SR-10', description: 'Service Tax 10%', rate: 10.00, tax_type: 'Service Tax', inputGl: '115-000', outputGl: '213-000' },
        { code: 'ZRL', description: 'Zero-Rated', rate: 0.00, tax_type: 'Zero-rated', inputGl: null, outputGl: null },
        { code: 'TX-E', description: 'Exempt', rate: 0.00, tax_type: 'Exempt', inputGl: null, outputGl: null },
        { code: 'OS', description: 'Out of Scope', rate: 0.00, tax_type: 'Out of Scope', inputGl: null, outputGl: null },
      ];

      for (const tc of SST_DEFAULTS) {
        const glId = tc.inputGl ? codeToId[tc.inputGl] ?? null : null;
        await prisma.taxCode.create({
          data: {
            firm_id: firmId,
            code: tc.code,
            description: tc.description,
            rate: tc.rate,
            tax_type: tc.tax_type,
            gl_account_id: glId,
          },
        });
        taxCodesCreated++;
      }
    }

    return NextResponse.json({
      data: {
        created,
        taxCodesCreated,
        defaultsSet: Object.keys(defaults),
        message: `Created ${created} GL accounts and ${taxCodesCreated} tax codes.`,
      },
      error: null,
    }, { status: 201 });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
