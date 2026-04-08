import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

/**
 * GET: Fetch GL defaults + bank account mappings for a firm.
 * PATCH: Update bank account GL mappings (create/upsert).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');

  if (!firmId || (firmIds && !firmIds.includes(firmId))) {
    return NextResponse.json({ data: null, error: 'firmId required' }, { status: 400 });
  }

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      default_trade_payables_gl_id: true,
      default_staff_claims_gl_id: true,
      default_trade_receivables_gl_id: true,
      defaultTradePayables: { select: { id: true, account_code: true, name: true } },
      defaultStaffClaims: { select: { id: true, account_code: true, name: true } },
      defaultTradeReceivables: { select: { id: true, account_code: true, name: true } },
    },
  });

  // Get all distinct bank accounts from statements for this firm
  const statements = await prisma.bankStatement.findMany({
    where: { firm_id: firmId },
    select: { bank_name: true, account_number: true },
    distinct: ['bank_name', 'account_number'],
  });

  // Get existing bank account GL mappings
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { firm_id: firmId },
    include: { glAccount: { select: { id: true, account_code: true, name: true } } },
  });

  const bankAccountMap = new Map(
    bankAccounts.map((a) => [`${a.bank_name}|${a.account_number}`, a])
  );

  // Merge: show all banks from statements, with GL mapping if configured
  const bankMappings = statements.map((s) => {
    const key = `${s.bank_name}|${s.account_number ?? ''}`;
    const mapping = bankAccountMap.get(key);
    return {
      bank_name: s.bank_name,
      account_number: s.account_number ?? '',
      gl_account_id: mapping?.gl_account_id ?? null,
      gl_account_label: mapping ? `${mapping.glAccount.account_code} — ${mapping.glAccount.name}` : null,
      id: mapping?.id ?? null,
    };
  });

  return NextResponse.json({
    data: {
      gl_defaults: {
        trade_payables: firm?.defaultTradePayables ? {
          id: firm.defaultTradePayables.id,
          label: `${firm.defaultTradePayables.account_code} — ${firm.defaultTradePayables.name}`,
        } : null,
        staff_claims: firm?.defaultStaffClaims ? {
          id: firm.defaultStaffClaims.id,
          label: `${firm.defaultStaffClaims.account_code} — ${firm.defaultStaffClaims.name}`,
        } : null,
        trade_receivables: firm?.defaultTradeReceivables ? {
          id: firm.defaultTradeReceivables.id,
          label: `${firm.defaultTradeReceivables.account_code} — ${firm.defaultTradeReceivables.name}`,
        } : null,
      },
      default_trade_receivables_gl_id: firm?.default_trade_receivables_gl_id ?? null,
      bank_mappings: bankMappings,
    },
    error: null,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();
  const { firmId, bank_name, account_number, gl_account_id } = body;

  if (!firmId || (firmIds && !firmIds.includes(firmId))) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  if (!bank_name || !gl_account_id) {
    return NextResponse.json({ data: null, error: 'bank_name and gl_account_id required' }, { status: 400 });
  }

  const account = await prisma.bankAccount.upsert({
    where: {
      firm_id_bank_name_account_number: {
        firm_id: firmId,
        bank_name,
        account_number: account_number ?? '',
      },
    },
    update: { gl_account_id },
    create: {
      firm_id: firmId,
      bank_name,
      account_number: account_number ?? '',
      gl_account_id,
    },
  });

  return NextResponse.json({ data: { id: account.id }, error: null });
}
