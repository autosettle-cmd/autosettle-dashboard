import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { recalcInvoicePaid } from '../lib/invoice-payment';

async function main() {
  // Find all invoices where amount_paid > total_amount
  const bad = await prisma.invoice.findMany({
    where: { amount_paid: { gt: prisma.invoice.fields.total_amount } },
    select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, amount_paid: true },
  });

  // Can't compare columns directly — just recalc all invoices that have any bank txn allocations
  const allocatedInvoiceIds = await prisma.bankTransactionInvoice.findMany({
    select: { invoice_id: true },
    distinct: ['invoice_id'],
  });

  console.log(`Found ${allocatedInvoiceIds.length} invoices with bank recon allocations. Recalculating...`);

  for (const { invoice_id } of allocatedInvoiceIds) {
    await recalcInvoicePaid(invoice_id);
  }

  // Verify fix
  const stillBad = await prisma.$queryRaw`
    SELECT id, invoice_number, vendor_name_raw, total_amount, amount_paid
    FROM "Invoice"
    WHERE amount_paid > total_amount AND total_amount > 0
  ` as { id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number }[];

  if (stillBad.length > 0) {
    console.log(`\nStill have ${stillBad.length} invoices with amount_paid > total_amount:`);
    for (const inv of stillBad) {
      console.log(`  ${inv.invoice_number} — ${inv.vendor_name_raw}: paid ${inv.amount_paid} > total ${inv.total_amount}`);
    }
  } else {
    console.log('\nAll invoice amounts are now correct.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
