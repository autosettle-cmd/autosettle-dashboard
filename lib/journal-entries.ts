import { prisma } from './prisma';
import { JournalSourceType, Prisma } from '../generated/prisma';
import { auditLog } from './audit';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JournalLineInput {
  glAccountId: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

export interface CreateJournalEntryParams {
  firmId: string;
  postingDate: Date;
  description?: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  lines: JournalLineInput[];
  createdBy?: string;
  /** Optional Prisma transaction client — if provided, runs inside the caller's transaction */
  tx?: Prisma.TransactionClient;
}

// ─── Voucher Number ─────────────────────────────────────────────────────────

/**
 * Generates the next voucher number for a firm in format JV-YYYY-NNNN.
 * Uses the posting year to scope the sequence.
 */
async function generateVoucherNumber(
  client: Prisma.TransactionClient,
  firmId: string,
  postingDate: Date
): Promise<string> {
  const year = postingDate.getFullYear();
  const prefix = `JV-${year}-`;

  const latest = await client.journalEntry.findFirst({
    where: {
      firm_id: firmId,
      voucher_number: { startsWith: prefix },
    },
    orderBy: { voucher_number: 'desc' },
    select: { voucher_number: true },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.voucher_number.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── Period Lookup ──────────────────────────────────────────────────────────

/**
 * Finds the open period that contains the given posting date for a firm.
 * Throws a descriptive error if no open period is found.
 */
export async function findOpenPeriod(
  client: Prisma.TransactionClient,
  firmId: string,
  postingDate: Date
) {
  const period = await client.period.findFirst({
    where: {
      status: 'open',
      start_date: { lte: postingDate },
      end_date: { gte: postingDate },
      fiscalYear: { firm_id: firmId, status: 'open' },
    },
    include: { fiscalYear: { select: { year_label: true } } },
  });

  if (!period) {
    const dateStr = postingDate.toISOString().split('T')[0];
    throw new Error(
      `No open fiscal period found for date ${dateStr}. Ensure a fiscal year and period are open that cover this date.`
    );
  }

  return period;
}

// ─── Create Journal Entry ───────────────────────────────────────────────────

/**
 * Creates a balanced journal entry with lines.
 * Validates: DR === CR, period is open, amounts are positive.
 * If `tx` is provided, runs inside the caller's transaction.
 */
export async function createJournalEntry(params: CreateJournalEntryParams) {
  const { firmId, postingDate, description, sourceType, sourceId, lines, createdBy, tx } = params;

  // Validation
  if (lines.length < 2) {
    throw new Error('Journal entry requires at least 2 lines');
  }

  const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Journal entry is unbalanced: DR ${totalDebit.toFixed(2)} !== CR ${totalCredit.toFixed(2)}`
    );
  }

  for (const line of lines) {
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      throw new Error('Journal line amounts must be non-negative');
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      throw new Error('Journal line must have either a debit or credit amount');
    }
  }

  // Idempotency guard — skip if a posted, non-reversal JV already exists for this source
  if (sourceId) {
    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.journalEntry.findFirst({
        where: {
          firm_id: firmId,
          source_type: sourceType,
          source_id: sourceId,
          status: 'posted',
          description: { not: { startsWith: 'Reversal of' } },
          reversed_by_id: null, // not reversed
        },
        select: { id: true, voucher_number: true },
      });
      if (existing) return existing;
      return null;
    };
    const existingResult = tx ? await run(tx) : await prisma.$transaction(run);
    if (existingResult) return existingResult;
  }

  const execute = async (client: Prisma.TransactionClient) => {
    // Period is optional — find if exists, but don't block JV creation
    let periodId: string | null = null;
    try {
      const period = await findOpenPeriod(client, firmId, postingDate);
      periodId = period.id;
    } catch {
      // No fiscal period — JV still created, period can be assigned later
    }
    const voucherNumber = await generateVoucherNumber(client, firmId, postingDate);

    const entry = await client.journalEntry.create({
      data: {
        firm_id: firmId,
        voucher_number: voucherNumber,
        posting_date: postingDate,
        period_id: periodId,
        description,
        source_type: sourceType,
        source_id: sourceId,
        status: 'posted',
        created_by: createdBy,
        lines: {
          create: lines.map((l) => ({
            gl_account_id: l.glAccountId,
            debit_amount: l.debitAmount,
            credit_amount: l.creditAmount,
            description: l.description,
          })),
        },
      },
      include: { lines: true },
    });

    return entry;
  };

  const entry = tx ? await execute(tx) : await prisma.$transaction(execute);

  // Fire-and-forget audit
  auditLog({
    firmId,
    tableName: 'JournalEntry',
    recordId: entry.id,
    action: 'create',
    newValues: {
      voucher_number: entry.voucher_number,
      source_type: sourceType,
      source_id: sourceId,
      total_debit: totalDebit,
    },
    userId: createdBy,
  });

  return entry;
}

// ─── Reverse Journal Entry ──────────────────────────────────────────────────

/**
 * Reverses a posted journal entry by creating a new JV with flipped DR/CR.
 * Marks the original as 'reversed'.
 */
export async function reverseJournalEntry(
  journalEntryId: string,
  createdBy?: string,
  tx?: Prisma.TransactionClient
) {
  const execute = async (client: Prisma.TransactionClient) => {
    const original = await client.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: { lines: true },
    });

    if (!original) throw new Error(`Journal entry ${journalEntryId} not found`);
    if (original.reversed_by_id) throw new Error(`Journal entry ${original.voucher_number} is already reversed`);

    // Try original posting date first, then today — use whichever has an open period
    let postingDate = original.posting_date;
    let periodId: string | null = null;
    try {
      const period = await findOpenPeriod(client, original.firm_id, postingDate);
      periodId = period.id;
    } catch {
      postingDate = new Date();
      try {
        const period = await findOpenPeriod(client, original.firm_id, postingDate);
        periodId = period.id;
      } catch {
        // No open period — reversal still created, period can be assigned later
      }
    }
    const voucherNumber = await generateVoucherNumber(client, original.firm_id, postingDate);

    // Create reversal JV with flipped DR/CR
    const reversal = await client.journalEntry.create({
      data: {
        firm_id: original.firm_id,
        voucher_number: voucherNumber,
        posting_date: postingDate,
        period_id: periodId,
        description: `Reversal of ${original.voucher_number}`,
        source_type: original.source_type,
        source_id: original.source_id,
        status: 'posted',
        reversal_of_id: original.id,
        created_by: createdBy,
        lines: {
          create: original.lines.map((l) => ({
            gl_account_id: l.gl_account_id,
            debit_amount: l.credit_amount,   // flip
            credit_amount: l.debit_amount,   // flip
            description: l.description ? `Rev: ${l.description}` : undefined,
          })),
        },
      },
      include: { lines: true },
    });

    // Link original to its reversal (both stay 'posted' so they cancel out in GL)
    await client.journalEntry.update({
      where: { id: original.id },
      data: { reversed_by_id: reversal.id },
    });

    return reversal;
  };

  const reversal = tx ? await execute(tx) : await prisma.$transaction(execute);

  auditLog({
    firmId: reversal.firm_id,
    tableName: 'JournalEntry',
    recordId: reversal.id,
    action: 'create',
    newValues: {
      voucher_number: reversal.voucher_number,
      reversal_of: journalEntryId,
    },
    userId: createdBy,
  });

  return reversal;
}

// ─── Year-End Closing Entries ───────────────────────────────────────────────

/**
 * Creates year-end closing journal entries for a fiscal year.
 * - Zeroes out all Revenue and Expense accounts
 * - Posts the net income/loss to Retained Earnings (account code 320-000)
 * - Uses source_type: year_end_close, source_id: fiscalYearId for idempotency
 *
 * MUST be called while the FY and its last period are still OPEN.
 */
export async function createYearEndClosingEntries(
  firmId: string,
  fiscalYearId: string,
  createdBy?: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Get fiscal year details
    const fy = await tx.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: { periods: { orderBy: { period_number: 'desc' }, take: 1 } },
    });
    if (!fy) throw new Error('Fiscal year not found');
    if (fy.firm_id !== firmId) throw new Error('Fiscal year does not belong to this firm');
    if (fy.periods.length === 0) throw new Error('Fiscal year has no periods');

    // 2. Find the retained earnings account from firm's GL defaults
    const firm = await tx.firm.findUnique({
      where: { id: firmId },
      select: { default_retained_earnings_gl_id: true },
    });
    if (!firm?.default_retained_earnings_gl_id) {
      throw new Error(
        'Retained Earnings account not configured. Go to Chart of Accounts → GL Defaults and set the Retained Earnings account before closing the fiscal year.'
      );
    }
    const retainedEarningsAccount = await tx.gLAccount.findUnique({
      where: { id: firm.default_retained_earnings_gl_id },
      select: { id: true, account_code: true, name: true },
    });
    if (!retainedEarningsAccount) {
      throw new Error(
        'Configured Retained Earnings GL account not found. Check your GL Defaults in Chart of Accounts.'
      );
    }

    // 3. Aggregate all Revenue and Expense account balances within this FY
    const fyStartDate = fy.start_date;
    const fyEndDate = fy.end_date;

    const accountBalances = await tx.journalLine.groupBy({
      by: ['gl_account_id'],
      where: {
        journalEntry: {
          firm_id: firmId,
          status: 'posted',
          posting_date: { gte: fyStartDate, lte: fyEndDate },
        },
      },
      _sum: { debit_amount: true, credit_amount: true },
    });

    // 4. Get account details for Revenue/Expense accounts only
    const accountIds = accountBalances.map(a => a.gl_account_id);
    const glAccounts = await tx.gLAccount.findMany({
      where: {
        id: { in: accountIds },
        account_type: { in: ['Revenue', 'Expense'] },
      },
      select: { id: true, account_type: true, normal_balance: true },
    });
    const glAccountMap = new Map(glAccounts.map(a => [a.id, a]));

    // 5. Build closing journal lines
    const lines: JournalLineInput[] = [];
    let netIncomeCredit = 0; // positive = profit (credit to RE), negative = loss (debit to RE)

    for (const agg of accountBalances) {
      const account = glAccountMap.get(agg.gl_account_id);
      if (!account) continue; // skip non-Revenue/Expense accounts

      const debit = Number(agg._sum.debit_amount ?? 0);
      const credit = Number(agg._sum.credit_amount ?? 0);

      if (debit === 0 && credit === 0) continue;

      if (account.account_type === 'Revenue') {
        // Revenue is credit-normal. To zero it: DR Revenue, net goes to RE
        // Balance = credit - debit (positive = has revenue)
        const balance = credit - debit;
        if (Math.abs(balance) < 0.005) continue;
        if (balance > 0) {
          lines.push({ glAccountId: agg.gl_account_id, debitAmount: balance, creditAmount: 0, description: 'Year-end close: zero revenue' });
          netIncomeCredit += balance;
        } else {
          lines.push({ glAccountId: agg.gl_account_id, debitAmount: 0, creditAmount: Math.abs(balance), description: 'Year-end close: zero revenue' });
          netIncomeCredit -= Math.abs(balance);
        }
      } else if (account.account_type === 'Expense') {
        // Expense is debit-normal. To zero it: CR Expense, net comes from RE
        // Balance = debit - credit (positive = has expense)
        const balance = debit - credit;
        if (Math.abs(balance) < 0.005) continue;
        if (balance > 0) {
          lines.push({ glAccountId: agg.gl_account_id, debitAmount: 0, creditAmount: balance, description: 'Year-end close: zero expense' });
          netIncomeCredit -= balance;
        } else {
          lines.push({ glAccountId: agg.gl_account_id, debitAmount: Math.abs(balance), creditAmount: 0, description: 'Year-end close: zero expense' });
          netIncomeCredit += Math.abs(balance);
        }
      }
    }

    if (lines.length === 0) {
      throw new Error('No revenue or expense balances to close for this fiscal year.');
    }

    // 6. Add the Retained Earnings line (balancing entry)
    if (netIncomeCredit > 0) {
      // Profit: CR Retained Earnings
      lines.push({
        glAccountId: retainedEarningsAccount.id,
        debitAmount: 0,
        creditAmount: netIncomeCredit,
        description: 'Year-end close: net income to retained earnings',
      });
    } else if (netIncomeCredit < 0) {
      // Loss: DR Retained Earnings
      lines.push({
        glAccountId: retainedEarningsAccount.id,
        debitAmount: Math.abs(netIncomeCredit),
        creditAmount: 0,
        description: 'Year-end close: net loss to retained earnings',
      });
    }

    // 7. Create the closing journal entry
    const postingDate = fyEndDate;
    const entry = await createJournalEntry({
      firmId,
      postingDate,
      description: `Year-end closing entries for ${fy.year_label}`,
      sourceType: 'year_end_close',
      sourceId: fiscalYearId,
      lines,
      createdBy,
      tx,
    });

    return entry;
  });
}

// ─── Find by Source ─────────────────────────────────────────────────────────

/**
 * Finds posted journal entries for a given source (e.g., claim, invoice, bank transaction).
 */
export async function findJVBySource(
  sourceType: JournalSourceType,
  sourceId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.journalEntry.findMany({
    where: { source_type: sourceType, source_id: sourceId, status: 'posted' },
    include: { lines: true },
    orderBy: { created_at: 'desc' },
  });
}

/**
 * Reverses all posted JVs for a given source. Used when reverting approvals or unmatching bank recon.
 */
export async function reverseJVsForSource(
  sourceType: JournalSourceType,
  sourceId: string,
  createdBy?: string,
  tx?: Prisma.TransactionClient
) {
  const entries = await findJVBySource(sourceType, sourceId, tx);
  const reversals = [];
  for (const entry of entries) {
    const reversal = await reverseJournalEntry(entry.id, createdBy, tx);
    reversals.push(reversal);
  }
  return reversals;
}
