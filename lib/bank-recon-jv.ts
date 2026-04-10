import { prisma } from './prisma';
import { createJournalEntry, reverseJVsForSource, findOpenPeriod } from './journal-entries';
import { recalcClaimPayment } from './payment-utils';

/**
 * Validates that all prerequisites are met for creating a bank recon JV.
 * Returns null if valid, or an error message string if not.
 */
export async function validateBankReconJV(
  bankTransactionId: string,
  paymentId: string,
  firmId: string
): Promise<string | null> {
  // Load bank transaction + statement
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { bank_name: true, account_number: true } } },
  });
  if (!txn) return 'Bank transaction not found.';

  // Check BankAccount GL mapping
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

  if (!bankAccount) {
    return `Bank account "${txn.bankStatement.bank_name} ${txn.bankStatement.account_number ?? ''}" has no GL account mapped. Go to Chart of Accounts → Bank Account GL to configure it.`;
  }

  // Check if this is an employee claim payment
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { employee_id: true },
  });
  const isClaimPayment = !!payment?.employee_id;

  // Check firm GL defaults
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { default_trade_payables_gl_id: true, default_staff_claims_gl_id: true, name: true },
  });

  if (isClaimPayment) {
    if (!firm?.default_staff_claims_gl_id) {
      return `Firm "${firm?.name}" has no Staff Claims Payable GL account configured. Go to Chart of Accounts → GL Defaults to set it up.`;
    }
  } else {
    if (!firm?.default_trade_payables_gl_id) {
      return `Firm "${firm?.name}" has no Trade Payables GL account configured. Go to Chart of Accounts → GL Defaults to set it up.`;
    }
  }

  // Check open fiscal period
  try {
    await findOpenPeriod(prisma, firmId, txn.transaction_date);
  } catch {
    const dateStr = txn.transaction_date.toISOString().split('T')[0];
    return `No open fiscal period for date ${dateStr}. Go to Fiscal Periods to create or open a period covering this date.`;
  }

  // Payment already loaded above — just check it exists
  if (!payment) return 'Payment not found.';

  return null; // All good
}

/**
 * Creates a bank recon JV when a payment is matched to a bank transaction.
 * DR Trade Payables / CR Bank GL (auto-detected from BankAccount mapping).
 * Call validateBankReconJV first to ensure prerequisites are met.
 */
export async function createBankReconJV(
  bankTransactionId: string,
  paymentId: string,
  firmId: string,
  createdBy?: string
): Promise<{ created: boolean; error?: string }> {
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { bank_name: true, account_number: true } } },
  });
  if (!txn) return { created: false, error: 'Bank transaction not found' };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { amount: true, direction: true, employee_id: true, supplier: { select: { name: true } }, employee: { select: { name: true } }, receipts: { select: { claim_id: true } } },
  });
  if (!payment) return { created: false, error: 'Payment not found' };

  const isClaimPayment = !!payment.employee_id;

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
  if (!bankAccount) return { created: false, error: 'Bank account GL not mapped' };

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { default_trade_payables_gl_id: true, default_staff_claims_gl_id: true },
  });

  const payableGlId = isClaimPayment ? firm?.default_staff_claims_gl_id : firm?.default_trade_payables_gl_id;
  if (!payableGlId) return { created: false, error: 'Firm GL defaults not set' };

  const amount = Number(payment.amount);
  const isOutgoing = payment.direction === 'outgoing';
  const counterpartyName = isClaimPayment ? (payment.employee?.name ?? 'Employee') : (payment.supplier?.name ?? 'Supplier');
  const payableLabel = isClaimPayment ? 'Staff Claims Payable' : 'Trade Payables';

  try {
    await createJournalEntry({
      firmId,
      postingDate: txn.transaction_date,
      description: `Bank recon — ${counterpartyName}`,
      sourceType: 'bank_recon',
      sourceId: bankTransactionId,
      lines: isOutgoing
        ? [
            { glAccountId: payableGlId, debitAmount: amount, creditAmount: 0, description: payableLabel },
            { glAccountId: bankAccount.gl_account_id, debitAmount: 0, creditAmount: amount, description: txn.bankStatement.bank_name },
          ]
        : [
            { glAccountId: bankAccount.gl_account_id, debitAmount: amount, creditAmount: 0, description: txn.bankStatement.bank_name },
            { glAccountId: payableGlId, debitAmount: 0, creditAmount: amount, description: payableLabel },
          ],
      createdBy,
    });

    // Recalc claim payment status if this is a claim payment
    if (isClaimPayment && payment.receipts.length > 0) {
      for (const r of payment.receipts) {
        await recalcClaimPayment(r.claim_id);
      }
    }

    return { created: true };
  } catch (err) {
    return { created: false, error: err instanceof Error ? err.message : 'JV creation failed' };
  }
}

/**
 * Reverses bank recon JVs when a match is undone.
 */
export async function reverseBankReconJV(
  bankTransactionId: string,
  createdBy?: string
): Promise<{ reversed: boolean; error?: string }> {
  try {
    // Before reversing, check if this is a claim payment so we can recalc after
    const txn = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      select: { matched_payment_id: true },
    });
    let claimIds: string[] = [];
    if (txn?.matched_payment_id) {
      const payment = await prisma.payment.findUnique({
        where: { id: txn.matched_payment_id },
        select: { employee_id: true, receipts: { select: { claim_id: true } } },
      });
      if (payment?.employee_id && payment.receipts.length > 0) {
        claimIds = payment.receipts.map(r => r.claim_id);
      }
    }

    const reversals = await reverseJVsForSource('bank_recon', bankTransactionId, createdBy);

    // Recalc claim payment status after reversal
    for (const cid of claimIds) {
      await recalcClaimPayment(cid);
    }

    return { reversed: reversals.length > 0 };
  } catch (err) {
    return { reversed: false, error: err instanceof Error ? err.message : 'JV reversal failed' };
  }
}
