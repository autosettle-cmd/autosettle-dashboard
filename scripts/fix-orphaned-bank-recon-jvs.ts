/**
 * One-time fix: Reverse orphaned bank_recon JVs whose source BankTransaction records were deleted.
 *
 * These 6 JVs are still "posted" with no reversed_by_id, incorrectly affecting GL balances:
 *   JV-2026-0004, JV-2026-0006, JV-2026-0007, JV-2026-0008, JV-2026-0011, JV-2026-0013
 *
 * Usage:
 *   npx tsx scripts/fix-orphaned-bank-recon-jvs.ts          # dry run
 *   npx tsx scripts/fix-orphaned-bank-recon-jvs.ts --execute # actually reverse
 */
import { prisma } from '../lib/prisma';
import { reverseJournalEntry } from '../lib/journal-entries';

const ORPHANED_VOUCHERS = [
  'JV-2026-0004',
  'JV-2026-0006',
  'JV-2026-0007',
  'JV-2026-0008',
  'JV-2026-0011',
  'JV-2026-0013',
];

async function main() {
  const execute = process.argv.includes('--execute');

  console.log(execute ? '=== EXECUTE MODE ===' : '=== DRY RUN (pass --execute to apply) ===');
  console.log('');

  // Fetch the orphaned JVs
  const jvs = await prisma.journalEntry.findMany({
    where: {
      voucher_number: { in: ORPHANED_VOUCHERS },
      status: 'posted',
      reversed_by_id: null, // not already reversed
    },
    include: { lines: true },
    orderBy: { voucher_number: 'asc' },
  });

  if (jvs.length === 0) {
    console.log('No orphaned JVs found to reverse. Already cleaned up?');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${jvs.length} orphaned JVs to reverse:\n`);

  for (const jv of jvs) {
    // Verify the source BankTransaction is truly missing
    const sourceExists = jv.source_id
      ? await prisma.bankTransaction.findUnique({ where: { id: jv.source_id }, select: { id: true } })
      : null;

    const totalDebit = jv.lines.reduce((s, l) => s + Number(l.debit_amount), 0);

    console.log(`  ${jv.voucher_number} | ${jv.description} | RM ${totalDebit.toFixed(2)} | source_exists=${!!sourceExists}`);

    if (sourceExists) {
      console.log(`    SKIPPING — source BankTransaction still exists`);
      continue;
    }

    if (execute) {
      try {
        const reversal = await reverseJournalEntry(jv.id, 'system-cleanup');
        console.log(`    REVERSED → ${reversal.voucher_number}`);
      } catch (err) {
        console.error(`    ERROR reversing ${jv.voucher_number}:`, err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`    Would reverse (dry run)`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main();
