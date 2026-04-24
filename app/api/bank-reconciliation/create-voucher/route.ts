import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createJournalEntry } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionId, supplier_id, new_supplier_name, category_id, gl_account_id, reference, notes } = await request.json();
  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId is required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } } },
  });
  if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }
  if (txn.recon_status !== 'unmatched') {
    return NextResponse.json({ data: null, error: 'Transaction is already matched or excluded' }, { status: 400 });
  }
  if (!txn.debit) {
    return NextResponse.json({ data: null, error: 'Payment voucher is only for debit (money going out) transactions' }, { status: 400 });
  }

  const firmId = txn.bankStatement.firm_id;
  const amount = Number(txn.debit);
  const merchant = txn.description.includes(' | ') ? txn.description.split(' | ')[0].trim() : txn.description.trim();

  // Resolve supplier — create inline if new_supplier_name provided
  let resolvedSupplierId = supplier_id;
  if (!resolvedSupplierId && new_supplier_name?.trim()) {
    const newSupplier = await prisma.supplier.create({
      data: { firm_id: firmId, name: new_supplier_name.trim() },
    });
    resolvedSupplierId = newSupplier.id;
  }
  // Default to "Walk-in Customer" if no supplier specified
  if (!resolvedSupplierId) {
    const walkIn = await prisma.supplier.findFirst({ where: { firm_id: firmId, name: 'Walk-in Customer' } });
    if (walkIn) {
      resolvedSupplierId = walkIn.id;
    } else {
      const newWalkIn = await prisma.supplier.create({ data: { firm_id: firmId, name: 'Walk-in Customer' } });
      resolvedSupplierId = newWalkIn.id;
    }
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: resolvedSupplierId }, select: { firm_id: true, name: true } });
  if (!supplier || supplier.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Supplier not found in this firm' }, { status: 404 });
  }

  // ─── Pre-validate GL accounts — block if JV cannot be created ─────────
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

  let expenseGlId: string | null = gl_account_id || null;
  if (!expenseGlId && category_id) {
    const catOverride = await prisma.categoryFirmOverride.findUnique({
      where: { category_id_firm_id: { category_id, firm_id: firmId } },
      select: { gl_account_id: true },
    });
    expenseGlId = catOverride?.gl_account_id ?? null;
  }
  if (!expenseGlId) {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_payables_gl_id: true } });
    expenseGlId = firm?.default_trade_payables_gl_id ?? null;
  }

  const missing: string[] = [];
  if (!bankAccount?.gl_account_id) missing.push(`Bank account "${txn.bankStatement.bank_name} ${txn.bankStatement.account_number ?? ''}" has no GL account mapped. Go to Bank Recon → Manage Accounts and assign a GL.`);
  if (!expenseGlId) missing.push('No expense GL account found. Assign a GL account, set a category GL mapping, or configure firm default Trade Payables GL.');
  if (missing.length > 0) {
    return NextResponse.json({ data: null, error: `Cannot create payment voucher — JV requires GL accounts:\n${missing.join('\n')}` }, { status: 400 });
  }

  // Generate PV number if no reference provided — PV-001 per-firm sequence
  let voucherNumber = reference;
  if (!voucherNumber) {
    const existing = await prisma.invoice.findMany({
      where: { firm_id: firmId, invoice_number: { startsWith: 'PV-' } },
      select: { invoice_number: true },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    let maxNum = 0;
    const regex = /PV-(\d+)/;
    for (const inv of existing) {
      const m = inv.invoice_number?.match(regex);
      if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
    }
    voucherNumber = `PV-${String(maxNum + 1).padStart(3, '0')}`;
  }

  // Create Invoice record (accounts payable — money going out to supplier, already paid)
  const invoice = await prisma.invoice.create({
    data: {
      firm_id: firmId,
      uploaded_by: session.user.employee_id || session.user.id,
      supplier_id: resolvedSupplierId,
      supplier_link_status: 'confirmed',
      vendor_name_raw: supplier.name,
      invoice_number: voucherNumber,
      issue_date: txn.transaction_date,
      total_amount: amount,
      amount_paid: amount,
      category_id: category_id || null,
      confidence: 'HIGH',
      status: 'reviewed',
      payment_status: 'paid',
      submitted_via: 'dashboard',
      approval: 'approved',
      notes: notes || `Payment voucher — ${merchant}`,
      gl_account_id: gl_account_id || null,
    },
  });

  // Link bank transaction to invoice
  await prisma.bankTransactionInvoice.create({
    data: {
      bank_transaction_id: bankTransactionId,
      invoice_id: invoice.id,
      amount: amount,
    },
  });

  // Mark bank txn as matched
  await prisma.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      recon_status: 'manually_matched',
      matched_at: new Date(),
      matched_by: session.user.id,
      notes: notes || `Payment voucher — ${supplier.name}${reference ? ` (${reference})` : ''}`,
    },
  });

  // Create JV — GL accounts already validated above
  const category = category_id ? await prisma.category.findUnique({ where: { id: category_id }, select: { name: true } }) : null;
  await createJournalEntry({
    firmId,
    postingDate: txn.transaction_date,
    description: `Payment voucher — ${supplier.name} (${voucherNumber})`,
    sourceType: 'bank_recon',
    sourceId: bankTransactionId,
    voucherPrefix: 'PV',
    lines: [
      { glAccountId: expenseGlId!, debitAmount: amount, creditAmount: 0, description: `${category?.name ?? 'Expense'} — ${supplier.name}` },
      { glAccountId: bankAccount!.gl_account_id, debitAmount: 0, creditAmount: amount, description: txn.bankStatement.bank_name },
    ],
    createdBy: session.user.id,
  });

  return NextResponse.json({
    data: { recon_status: 'manually_matched', invoice_id: invoice.id },
    error: null,
  });
}
