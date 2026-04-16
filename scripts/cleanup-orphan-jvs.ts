import { prisma } from '../lib/prisma';

async function main() {
  const allJEs = await prisma.journalEntry.findMany({
    where: { source_id: { not: null } },
    select: { id: true, source_type: true, source_id: true, description: true },
  });

  const orphans: typeof allJEs = [];
  for (const je of allJEs) {
    let exists = false;
    try {
      if (je.source_type === 'bank_recon') {
        exists = !!(await prisma.bankTransaction.findUnique({ where: { id: je.source_id! }, select: { id: true } }));
      } else if (je.source_type === 'invoice_posting') {
        exists = !!(await prisma.invoice.findUnique({ where: { id: je.source_id! }, select: { id: true } }));
      } else if (je.source_type === 'sales_invoice_posting') {
        exists = !!(await prisma.salesInvoice.findUnique({ where: { id: je.source_id! }, select: { id: true } }));
      } else if (je.source_type === 'claim_approval') {
        exists = !!(await prisma.claim.findUnique({ where: { id: je.source_id! }, select: { id: true } }));
      } else {
        exists = true;
      }
    } catch { exists = false; }
    if (!exists) orphans.push(je);
  }

  console.log(`Found ${orphans.length} orphaned JVs:`);
  for (const o of orphans) {
    console.log(`  - ${o.id} | ${o.source_type} | ${o.description}`);
  }

  if (orphans.length > 0) {
    const ids = orphans.map(o => o.id);
    // Clear reversal references pointing to orphans
    await prisma.journalEntry.updateMany({
      where: { reversed_by_id: { in: ids } },
      data: { reversed_by_id: null },
    });
    await prisma.journalEntry.updateMany({
      where: { reversal_of_id: { in: ids } },
      data: { reversal_of_id: null },
    });
    // Delete orphans (JournalLine cascades)
    const deleted = await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${deleted.count} orphaned JVs.`);
  } else {
    console.log('No orphans found.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
