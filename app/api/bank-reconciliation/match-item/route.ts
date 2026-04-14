import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createJournalEntry, findOpenPeriod } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

/**
 * Matches a bank transaction directly to an invoice, sales invoice, or claim.
 * No Payment record needed — direct FK link on BankTransaction.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { bankTransactionId, invoiceId, salesInvoiceId, claimId, glAccountId } = body as {
    bankTransactionId: string;
    invoiceId?: string;
    salesInvoiceId?: string;
    claimId?: string;
    glAccountId?: string;
  };

  if (!bankTransactionId) {
    return NextResponse.json({ data: null, error: 'bankTransactionId required' }, { status: 400 });
  }
  if (!invoiceId && !salesInvoiceId && !claimId) {
    return NextResponse.json({ data: null, error: 'Must provide invoiceId, salesInvoiceId, or claimId' }, { status: 400 });
  }

  // Load bank transaction
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } } },
  });
  if (!txn) return NextResponse.json({ data: null, error: 'Bank transaction not found' }, { status: 404 });
  if (txn.recon_status === 'manually_matched') return NextResponse.json({ data: null, error: 'Transaction already confirmed' }, { status: 400 });

  const firmId = txn.bankStatement.firm_id;

  // Verify access
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Unauthorized for this firm' }, { status: 403 });
    }
  }

  // Get bank GL account
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
    return NextResponse.json({ data: null, error: 'Bank account has no GL mapping. Assign a GL account to this bank account first.' }, { status: 400 });
  }
  const bankGlId = bankAccount.gl_account_id;

  const txnAmount = Number(txn.credit ?? txn.debit ?? 0);

  try {
    // ─── Match to Supplier Invoice (DEBIT / outgoing) ────────────────────
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, vendor_name_raw: true, gl_account_id: true,
          supplier: { select: { default_contra_gl_account_id: true } } },
      });
      if (!invoice || invoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
      }

      // Determine contra GL: supplier sub-account → firm default
      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_payables_gl_id: true } });
      const contraGlId = glAccountId || invoice.supplier?.default_contra_gl_account_id || firm?.default_trade_payables_gl_id;
      if (!contraGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Payables GL configured for this supplier.' }, { status: 400 });
      }

      const payAmount = txnAmount;

      // Link bank transaction directly to invoice
      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched_invoice_id: invoiceId,
          recon_status: 'manually_matched',
          matched_at: new Date(),
          matched_by: session.user.id,
        },
      });

      // Update invoice payment
      const newPaid = Number(invoice.amount_paid) + payAmount;
      const total = Number(invoice.total_amount);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          amount_paid: newPaid,
          payment_status: newPaid >= total ? 'paid' : 'partially_paid',
        },
      });

      // JV: DR Trade Payables / CR Bank
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${invoice.vendor_name_raw}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        lines: [
          { glAccountId: contraGlId, debitAmount: payAmount, creditAmount: 0, description: 'Trade Payables' },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: payAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true }, error: null });
    }

    // ─── Match to Sales Invoice (CREDIT / incoming) ──────────────────────
    if (salesInvoiceId) {
      const salesInvoice = await prisma.salesInvoice.findUnique({
        where: { id: salesInvoiceId },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, invoice_number: true,
          buyer: { select: { name: true } } },
      });
      if (!salesInvoice || salesInvoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
      }

      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_receivables_gl_id: true } });
      const receivablesGlId = glAccountId || firm?.default_trade_receivables_gl_id;
      if (!receivablesGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Receivables GL configured.' }, { status: 400 });
      }

      const payAmount = txnAmount;

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched_sales_invoice_id: salesInvoiceId,
          recon_status: 'manually_matched',
          matched_at: new Date(),
          matched_by: session.user.id,
        },
      });

      const newPaid = Number(salesInvoice.amount_paid) + payAmount;
      const total = Number(salesInvoice.total_amount);
      await prisma.salesInvoice.update({
        where: { id: salesInvoiceId },
        data: {
          amount_paid: newPaid,
          payment_status: newPaid >= total ? 'paid' : 'partially_paid',
        },
      });

      // JV: DR Bank / CR Trade Receivables
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${salesInvoice.buyer?.name ?? 'Customer'}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        lines: [
          { glAccountId: bankGlId, debitAmount: payAmount, creditAmount: 0, description: txn.bankStatement.bank_name },
          { glAccountId: receivablesGlId, debitAmount: 0, creditAmount: payAmount, description: 'Trade Receivables' },
        ],
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true }, error: null });
    }

    // ─── Match to Employee Claim (DEBIT / outgoing) ──────────────────────
    if (claimId) {
      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        select: {
          id: true, firm_id: true, amount: true, merchant: true, category_id: true, gl_account_id: true,
          employee: { select: { id: true, name: true } },
          category: { select: { name: true } },
        },
      });
      if (!claim || claim.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Claim not found' }, { status: 404 });
      }

      // Determine expense GL: provided > claim > category mapping
      let expenseGlId = glAccountId || claim.gl_account_id;
      if (!expenseGlId && claim.category_id) {
        const catOverride = await prisma.categoryFirmOverride.findUnique({
          where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
          select: { gl_account_id: true },
        });
        expenseGlId = catOverride?.gl_account_id ?? null;
      }
      if (!expenseGlId) {
        return NextResponse.json({ data: null, error: 'No GL account for this claim category. Select a GL account.' }, { status: 400 });
      }

      const payAmount = Number(claim.amount);

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched_claim_id: claimId,
          recon_status: 'manually_matched',
          matched_at: new Date(),
          matched_by: session.user.id,
        },
      });

      await prisma.claim.update({
        where: { id: claimId },
        data: { payment_status: 'paid' },
      });

      // Save category GL mapping for future use
      if (glAccountId && claim.category_id) {
        await prisma.categoryFirmOverride.upsert({
          where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
          update: { gl_account_id: glAccountId },
          create: { firm_id: firmId, category_id: claim.category_id, gl_account_id: glAccountId },
        });
      }

      // JV: DR Expense GL / CR Bank
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `${claim.category.name} — ${claim.merchant} (${claim.employee.name})`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        lines: [
          { glAccountId: expenseGlId, debitAmount: payAmount, creditAmount: 0, description: `${claim.category.name} — ${claim.merchant}` },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: payAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });

      return NextResponse.json({ data: { matched: true }, error: null });
    }

    return NextResponse.json({ data: null, error: 'No match target provided' }, { status: 400 });
  } catch (err) {
    console.error('Match-item error:', err);
    return NextResponse.json({ data: null, error: `Match failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
