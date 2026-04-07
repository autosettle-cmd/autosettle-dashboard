import { prisma } from './prisma';
import { createJournalEntry, reverseJVsForSource } from './journal-entries';

/**
 * Creates a bank recon JV when a payment is matched to a bank transaction.
 * DR Trade Payables / CR Bank GL (auto-detected from BankAccount mapping).
 * Silently skips if BankAccount GL mapping is not configured.
 */
export async function createBankReconJV(
  bankTransactionId: string,
  paymentId: string,
  firmId: string,
  createdBy?: string
): Promise<{ created: boolean; warning?: string }> {
  // Load bank transaction + statement to get bank_name + account_number
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { bank_name: true, account_number: true } } },
  });
  if (!txn) return { created: false, warning: 'Bank transaction not found' };

  // Load payment amount
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { amount: true, direction: true, supplier: { select: { name: true } } },
  });
  if (!payment) return { created: false, warning: 'Payment not found' };

  // Look up BankAccount → GL mapping
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
    return { created: false, warning: `No GL mapping for bank ${txn.bankStatement.bank_name} ${txn.bankStatement.account_number ?? ''}` };
  }

  // Load firm's default trade payables GL
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { default_trade_payables_gl_id: true },
  });

  if (!firm?.default_trade_payables_gl_id) {
    return { created: false, warning: 'Firm has no default Trade Payables GL configured' };
  }

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
    return { created: false, warning: err instanceof Error ? err.message : 'JV creation failed' };
  }
}

/**
 * Reverses bank recon JVs when a match is undone.
 */
export async function reverseBankReconJV(
  bankTransactionId: string,
  createdBy?: string
): Promise<{ reversed: boolean; warning?: string }> {
  try {
    const reversals = await reverseJVsForSource('bank_recon', bankTransactionId, createdBy);
    return { reversed: reversals.length > 0 };
  } catch (err) {
    return { reversed: false, warning: err instanceof Error ? err.message : 'JV reversal failed' };
  }
}
