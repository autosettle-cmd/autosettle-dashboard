import { prisma } from './prisma';
import { createJournalEntry, reverseJVsForSource, findOpenPeriod } from './journal-entries';

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

  // Check firm GL defaults
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { default_trade_payables_gl_id: true, name: true },
  });

  if (!firm?.default_trade_payables_gl_id) {
    return `Firm "${firm?.name}" has no Trade Payables GL account configured. Go to Chart of Accounts → GL Defaults to set it up.`;
  }

  // Check open fiscal period
  try {
    await findOpenPeriod(prisma, firmId, txn.transaction_date);
  } catch {
    const dateStr = txn.transaction_date.toISOString().split('T')[0];
    return `No open fiscal period for date ${dateStr}. Go to Fiscal Periods to create or open a period covering this date.`;
  }

  // Check payment exists
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  });
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
    select: { amount: true, direction: true, supplier: { select: { name: true } } },
  });
  if (!payment) return { created: false, error: 'Payment not found' };

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
    select: { default_trade_payables_gl_id: true },
  });
  if (!firm?.default_trade_payables_gl_id) return { created: false, error: 'Firm GL defaults not set' };

  const amount = Number(payment.amount);
  const isOutgoing = payment.direction === 'outgoing';

  try {
    await createJournalEntry({
      firmId,
      postingDate: txn.transaction_date,
      description: `Bank recon — ${payment.supplier.name}`,
      sourceType: 'bank_recon',
      sourceId: bankTransactionId,
      lines: isOutgoing
        ? [
            { glAccountId: firm.default_trade_payables_gl_id, debitAmount: amount, creditAmount: 0, description: 'Trade Payables' },
            { glAccountId: bankAccount.gl_account_id, debitAmount: 0, creditAmount: amount, description: txn.bankStatement.bank_name },
          ]
        : [
            { glAccountId: bankAccount.gl_account_id, debitAmount: amount, creditAmount: 0, description: txn.bankStatement.bank_name },
            { glAccountId: firm.default_trade_payables_gl_id, debitAmount: 0, creditAmount: amount, description: 'Trade Receivables' },
          ],
      createdBy,
    });

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
    const reversals = await reverseJVsForSource('bank_recon', bankTransactionId, createdBy);
    return { reversed: reversals.length > 0 };
  } catch (err) {
    return { reversed: false, error: err instanceof Error ? err.message : 'JV reversal failed' };
  }
}
