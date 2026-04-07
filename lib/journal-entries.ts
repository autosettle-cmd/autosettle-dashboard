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

  // Idempotency guard — skip if a posted JV already exists for this source
  if (sourceId) {
    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.journalEntry.findFirst({
        where: { firm_id: firmId, source_type: sourceType, source_id: sourceId, status: 'posted' },
        select: { id: true, voucher_number: true },
      });
      if (existing) return existing;
      return null;
    };
    const existingResult = tx ? await run(tx) : await prisma.$transaction(run);
    if (existingResult) return existingResult;
  }

  const execute = async (client: Prisma.TransactionClient) => {
    const period = await findOpenPeriod(client, firmId, postingDate);
    const voucherNumber = await generateVoucherNumber(client, firmId, postingDate);

    const entry = await client.journalEntry.create({
      data: {
        firm_id: firmId,
        voucher_number: voucherNumber,
        posting_date: postingDate,
        period_id: period.id,
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
    if (original.status === 'reversed') throw new Error(`Journal entry ${original.voucher_number} is already reversed`);

    const postingDate = new Date();
    const period = await findOpenPeriod(client, original.firm_id, postingDate);
    const voucherNumber = await generateVoucherNumber(client, original.firm_id, postingDate);

    // Create reversal JV with flipped DR/CR
    const reversal = await client.journalEntry.create({
      data: {
        firm_id: original.firm_id,
        voucher_number: voucherNumber,
        posting_date: postingDate,
        period_id: period.id,
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

    // Mark original as reversed
    await client.journalEntry.update({
      where: { id: original.id },
      data: { status: 'reversed', reversed_by_id: reversal.id },
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
