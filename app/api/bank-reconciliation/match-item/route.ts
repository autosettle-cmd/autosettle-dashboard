import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { createJournalEntry, findOpenPeriod } from '@/lib/journal-entries';
import { recalcInvoicePayment, recalcClaimPayment } from '@/lib/payment-utils';
import { recalcSalesInvoicePayment } from '@/lib/sales-payment-utils';

export const dynamic = 'force-dynamic';

/**
 * Matches a bank transaction to an invoice, sales invoice, or claim.
 * Creates Payment + allocation link + BankTransaction match + JV.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { bankTransactionId, invoiceId, salesInvoiceId, claimId, glAccountId, amount: matchAmount } = body as {
    bankTransactionId: string;
    invoiceId?: string;
    salesInvoiceId?: string;
    claimId?: string;
    glAccountId?: string;
    amount?: number;
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
  if (txn.matched_payment_id) return NextResponse.json({ data: null, error: 'Transaction already matched' }, { status: 400 });

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

  // Check fiscal period
  try {
    await findOpenPeriod(prisma, firmId, txn.transaction_date);
  } catch {
    return NextResponse.json({ data: null, error: `No open fiscal period for ${txn.transaction_date.toISOString().split('T')[0]}` }, { status: 400 });
  }

  try {
    // ─── Match to Supplier Invoice (DEBIT / outgoing) ────────────────────
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, supplier_id: true, vendor_name_raw: true, gl_account_id: true },
      });
      if (!invoice || invoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
      }

      const remaining = Number(invoice.total_amount) - Number(invoice.amount_paid);
      const payAmount = matchAmount ?? remaining;

      // Get firm default trade payables GL
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { default_trade_payables_gl_id: true },
      });
      const tradePayablesGlId = glAccountId || firm?.default_trade_payables_gl_id;
      if (!tradePayablesGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Payables GL configured. Set it in GL Defaults or select a GL account.' }, { status: 400 });
      }

      // Create Payment → PaymentAllocation → match BankTransaction → JV
      const payment = await prisma.payment.create({
        data: {
          firm_id: firmId,
          supplier_id: invoice.supplier_id,
          amount: payAmount,
          payment_date: txn.transaction_date,
          reference: txn.reference ?? txn.description,
          direction: 'outgoing',
          notes: `Bank recon match to invoice ${invoice.vendor_name_raw}`,
        },
      });

      await prisma.paymentAllocation.create({
        data: { payment_id: payment.id, invoice_id: invoiceId, amount: payAmount },
      });

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matched_payment_id: payment.id, recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
      });

      // JV: DR Trade Payables / CR Bank
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${invoice.vendor_name_raw}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        lines: [
          { glAccountId: tradePayablesGlId, debitAmount: payAmount, creditAmount: 0, description: 'Trade Payables' },
          { glAccountId: bankGlId, debitAmount: 0, creditAmount: payAmount, description: txn.bankStatement.bank_name },
        ],
        createdBy: session.user.id,
      });

      await recalcInvoicePayment(invoiceId);

      return NextResponse.json({ data: { matched: true, paymentId: payment.id }, error: null });
    }

    // ─── Match to Sales Invoice (CREDIT / incoming) ──────────────────────
    if (salesInvoiceId) {
      const salesInvoice = await prisma.salesInvoice.findUnique({
        where: { id: salesInvoiceId },
        select: { id: true, firm_id: true, total_amount: true, amount_paid: true, supplier_id: true, invoice_number: true, gl_account_id: true },
      });
      if (!salesInvoice || salesInvoice.firm_id !== firmId) {
        return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
      }

      const remaining = Number(salesInvoice.total_amount) - Number(salesInvoice.amount_paid);
      const payAmount = matchAmount ?? remaining;

      // Get buyer name
      const buyer = await prisma.supplier.findUnique({
        where: { id: salesInvoice.supplier_id },
        select: { name: true },
      });

      // Get firm default trade receivables GL
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { default_trade_receivables_gl_id: true },
      });
      const tradeReceivablesGlId = glAccountId || firm?.default_trade_receivables_gl_id;
      if (!tradeReceivablesGlId) {
        return NextResponse.json({ data: null, error: 'No Trade Receivables GL configured. Set it in GL Defaults or select a GL account.' }, { status: 400 });
      }

      // Create Payment → SalesPaymentAllocation → match BankTransaction → JV
      const payment = await prisma.payment.create({
        data: {
          firm_id: firmId,
          supplier_id: salesInvoice.supplier_id,
          amount: payAmount,
          payment_date: txn.transaction_date,
          reference: txn.reference ?? txn.description,
          direction: 'incoming',
          notes: `Bank recon match to sales invoice ${salesInvoice.invoice_number}`,
        },
      });

      await prisma.salesPaymentAllocation.create({
        data: { payment_id: payment.id, sales_invoice_id: salesInvoiceId, amount: payAmount },
      });

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matched_payment_id: payment.id, recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
      });

      // JV: DR Bank / CR Trade Receivables
      await createJournalEntry({
        firmId,
        postingDate: txn.transaction_date,
        description: `Bank recon — ${buyer?.name ?? 'Customer'}`,
        sourceType: 'bank_recon',
        sourceId: bankTransactionId,
        lines: [
          { glAccountId: bankGlId, debitAmount: payAmount, creditAmount: 0, description: txn.bankStatement.bank_name },
          { glAccountId: tradeReceivablesGlId, debitAmount: 0, creditAmount: payAmount, description: 'Trade Receivables' },
        ],
        createdBy: session.user.id,
      });

      await recalcSalesInvoicePayment(salesInvoiceId);

      return NextResponse.json({ data: { matched: true, paymentId: payment.id }, error: null });
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

      const payAmount = matchAmount ?? Number(claim.amount);

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

      // Create Payment → PaymentReceipt → match BankTransaction → JV
      const payment = await prisma.payment.create({
        data: {
          firm_id: firmId,
          employee_id: claim.employee.id,
          amount: payAmount,
          payment_date: txn.transaction_date,
          reference: txn.reference ?? txn.description,
          direction: 'outgoing',
          notes: `Bank recon reimbursement — ${claim.employee.name}`,
        },
      });

      await prisma.paymentReceipt.create({
        data: { payment_id: payment.id, claim_id: claimId, amount: payAmount },
      });

      await prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matched_payment_id: payment.id, recon_status: 'manually_matched', matched_at: new Date(), matched_by: session.user.id },
      });

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

      // Save category GL mapping for future use (learn inline)
      if (glAccountId && claim.category_id) {
        await prisma.categoryFirmOverride.upsert({
          where: { category_id_firm_id: { category_id: claim.category_id, firm_id: firmId } },
          update: { gl_account_id: glAccountId },
          create: { firm_id: firmId, category_id: claim.category_id, gl_account_id: glAccountId },
        });
      }

      await recalcClaimPayment(claimId);

      return NextResponse.json({ data: { matched: true, paymentId: payment.id }, error: null });
    }

    return NextResponse.json({ data: null, error: 'No match target provided' }, { status: 400 });
  } catch (err) {
    console.error('Match-item error:', err);
    return NextResponse.json({ data: null, error: `Match failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
