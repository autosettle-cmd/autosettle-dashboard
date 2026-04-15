import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createJournalEntry } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bankTransactionId, supplier_id, category_id, reference } = await request.json();
  if (!bankTransactionId || !category_id) {
    return NextResponse.json({ data: null, error: 'bankTransactionId and category_id are required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } } },
  });
  if (!txn || txn.bankStatement.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }
  if (txn.recon_status !== 'unmatched') {
    return NextResponse.json({ data: null, error: 'Transaction is already matched' }, { status: 400 });
  }
  if (!txn.credit) {
    return NextResponse.json({ data: null, error: 'Official receipt is only for credit (money coming in) transactions' }, { status: 400 });
  }

  const firmId = session.user.firm_id;
  const amount = Number(txn.credit);
  const merchant = txn.description.includes(' | ') ? txn.description.split(' | ')[0].trim() : txn.description.trim();

  // Resolve GL from category mapping
  const catOverride = await prisma.categoryFirmOverride.findUnique({
    where: { category_id_firm_id: { category_id, firm_id: firmId } },
    select: { gl_account_id: true },
  });
  const category = await prisma.category.findUnique({ where: { id: category_id }, select: { name: true } });
  if (!catOverride?.gl_account_id) {
    return NextResponse.json({ data: null, error: `No GL account mapped for category "${category?.name ?? category_id}". Set it up in Chart of Accounts.` }, { status: 400 });
  }
  const incomeGlId = catOverride.gl_account_id;

  // Resolve bank GL
  const bankAccount = await prisma.bankAccount.findUnique({
    where: {
      firm_id_bank_name_account_number: {
        firm_id: firmId,
        bank_name: txn.bankStatement.bank_name,
        account_number: txn.bankStatement.account_number ?? '',
      },
    },
    select: { gl_account_id: true },
  });
  if (!bankAccount?.gl_account_id) {
    return NextResponse.json({ data: null, error: `Bank account "${txn.bankStatement.bank_name}" has no GL mapping.` }, { status: 400 });
  }
  const bankGlId = bankAccount.gl_account_id;

  // Validate supplier if provided
  if (supplier_id) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplier_id }, select: { firm_id: true } });
    if (!supplier || supplier.firm_id !== firmId) {
      return NextResponse.json({ data: null, error: 'Supplier not found in this firm' }, { status: 404 });
    }
  }

  // Mark bank txn as matched
  await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      recon_status: 'manually_matched',
      matched_at: new Date(),
      matched_by: session.user.id,
      notes: `Official receipt — ${merchant}${reference ? ` (${reference})` : ''}`,
    },
  });

  // JV: DR Bank GL / CR Income/Revenue GL
  await createJournalEntry({
    firmId,
    postingDate: txn.transaction_date,
    description: `Official receipt — ${merchant}`,
    sourceType: 'bank_recon',
    sourceId: bankTransactionId,
    lines: [
      { glAccountId: bankGlId, debitAmount: amount, creditAmount: 0, description: txn.bankStatement.bank_name },
      { glAccountId: incomeGlId, debitAmount: 0, creditAmount: amount, description: `${category?.name ?? 'Income'} — ${merchant}` },
    ],
    createdBy: session.user.id,
  });

  return NextResponse.json({
    data: { recon_status: 'manually_matched' },
    error: null,
  });
}
