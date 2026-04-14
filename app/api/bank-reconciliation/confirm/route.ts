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

  const { bankTransactionIds } = await request.json();
  if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0) {
    return NextResponse.json({ data: null, error: 'bankTransactionIds required' }, { status: 400 });
  }

  // Load transactions with their matched items
  const txns = await prisma.bankTransaction.findMany({
    where: { id: { in: bankTransactionIds }, recon_status: 'matched' },
    include: {
      bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } },
    },
  });

  if (txns.length === 0) {
    return NextResponse.json({ data: null, error: 'No suggested matches found to confirm.' }, { status: 400 });
  }

  // Verify firm access
  for (const txn of txns) {
    if (firmIds && !firmIds.includes(txn.bankStatement.firm_id)) {
      return NextResponse.json({ data: null, error: 'Access denied' }, { status: 403 });
    }
  }

  // Validate — each txn must have a matched item
  const errors: string[] = [];
  for (const txn of txns) {
    if (!txn.matched_invoice_id && !txn.matched_sales_invoice_id && !txn.matched_claim_id && !txn.matched_payment_id) {
      errors.push(`Transaction ${txn.description} has no matched payment.`);
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ data: null, error: errors.join('\n') }, { status: 400 });
  }

  let confirmed = 0;
  for (const txn of txns) {
    const firmId = txn.bankStatement.firm_id;
    const txnAmount = Number(txn.debit ?? txn.credit ?? 0);

    // Get bank GL
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
      errors.push(`Bank account ${txn.bankStatement.bank_name} has no GL mapping.`);
      continue;
    }
    const bankGlId = bankAccount.gl_account_id;

    // ─── Confirm supplier invoice match ──────────────────────────────────
    if (txn.matched_invoice_id) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: txn.matched_invoice_id },
        select: { id: true, total_amount: true, amount_paid: true, vendor_name_raw: true,
          supplier: { select: { default_contra_gl_account_id: true } } },
      });
      if (!invoice) continue;

      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_payables_gl_id: true } });
      const contraGlId = invoice.supplier?.default_contra_gl_account_id || firm?.default_trade_payables_gl_id;
      if (!contraGlId) { errors.push(`No Trade Payables GL for ${invoice.vendor_name_raw}`); continue; }

      // Update invoice payment
      const newPaid = Number(invoice.amount_paid) + txnAmount;
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { amount_paid: newPaid, payment_status: newPaid >= Number(invoice.total_amount) ? 'paid' : 'partially_paid' },
      });

      // JV: DR Trade Payables / CR Bank
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${invoice.vendor_name_raw}`,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: [
          { glAccountId: contraGlId, debitAmount: txnAmount, creditAmount: 0, description: 'Trade Payables' },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: txnAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });
    }

    // ─── Confirm sales invoice match ─────────────────────────────────────
    if (txn.matched_sales_invoice_id) {
      const salesInvoice = await prisma.salesInvoice.findUnique({
        where: { id: txn.matched_sales_invoice_id },
        select: { id: true, total_amount: true, amount_paid: true, buyer: { select: { name: true } } },
      });
      if (!salesInvoice) continue;

      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_receivables_gl_id: true } });
      const receivablesGlId = firm?.default_trade_receivables_gl_id;
      if (!receivablesGlId) { errors.push('No Trade Receivables GL configured'); continue; }

      const newPaid = Number(salesInvoice.amount_paid) + txnAmount;
      await prisma.salesInvoice.update({
        where: { id: salesInvoice.id },
        data: { amount_paid: newPaid, payment_status: newPaid >= Number(salesInvoice.total_amount) ? 'paid' : 'partially_paid' },
      });

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${salesInvoice.buyer?.name ?? 'Customer'}`,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: [
          { glAccountId: bankGlId, debitAmount: txnAmount, creditAmount: 0, description: txn.bankStatement.bank_name },
          { glAccountId: receivablesGlId, debitAmount: 0, creditAmount: txnAmount, description: 'Trade Receivables' },
        ],
        createdBy: session.user.id,
      });
    }

    // ─── Confirm claim match ─────────────────────────────────────────────
    if (txn.matched_claim_id) {
      const claim = await prisma.claim.findUnique({
        where: { id: txn.matched_claim_id },
        select: { id: true, amount: true, merchant: true, category_id: true, gl_account_id: true,
          employee: { select: { name: true } }, category: { select: { name: true } } },
      });
      if (!claim) continue;

      let expenseGlId = claim.gl_account_id;
      if (!expenseGlId && claim.category_id) {
        const catOverride = await prisma.categoryFirmOverride.findUnique({
          where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
          select: { gl_account_id: true },
        });
        expenseGlId = catOverride?.gl_account_id ?? null;
      }
      if (!expenseGlId) { errors.push(`No GL for claim: ${claim.merchant}`); continue; }

      await prisma.claim.update({ where: { id: claim.id }, data: { payment_status: 'paid' } });

      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `${claim.category.name} — ${claim.merchant} (${claim.employee.name})`,
        sourceType: 'bank_recon',
        sourceId: txn.id,
        lines: [
          { glAccountId: expenseGlId, debitAmount: txnAmount, creditAmount: 0, description: `${claim.category.name} — ${claim.merchant}` },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: txnAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });
    }

    // ─── Legacy: confirm old Payment-based match ─────────────────────────
    if (txn.matched_payment_id && !txn.matched_invoice_id && !txn.matched_sales_invoice_id && !txn.matched_claim_id) {
      // Keep old flow for backward compatibility with existing matches
      const { createBankReconJV } = await import('@/lib/bank-recon-jv');
      await createBankReconJV(txn.id, txn.matched_payment_id, firmId, session.user.id);
    }

    // Mark as confirmed
    await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: { recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
    });
    confirmed++;
  }

  if (errors.length > 0) {
    return NextResponse.json({ data: { confirmed }, error: errors.join('\n') }, { status: confirmed > 0 ? 200 : 400 });
  }

  return NextResponse.json({ data: { confirmed }, error: null });
}
