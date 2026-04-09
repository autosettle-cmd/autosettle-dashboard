/**
 * Backfill period_start and period_end for existing BankStatements
 * by computing MIN/MAX transaction_date from their transactions.
 *
 * Usage: npx tsx scripts/backfill-statement-periods.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const statements = await prisma.bankStatement.findMany({
    where: { period_start: null },
    select: { id: true, transactions: { select: { transaction_date: true } } },
  });

  console.log(`Found ${statements.length} statements without period range.`);

  let updated = 0;
  for (const stmt of statements) {
    if (stmt.transactions.length === 0) continue;

    const dates = stmt.transactions.map((t) => new Date(t.transaction_date).getTime());
    const periodStart = new Date(Math.min(...dates));
    const periodEnd = new Date(Math.max(...dates));

    await prisma.bankStatement.update({
      where: { id: stmt.id },
      data: { period_start: periodStart, period_end: periodEnd },
    });
    updated++;
  }

  console.log(`Updated ${updated} statements with period ranges.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
