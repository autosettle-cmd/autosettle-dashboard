/**
 * Seed test data for bank reconciliation.
 * Creates suppliers and payments that match transactions from the uploaded bank statement PDF.
 *
 * Usage: npx tsx scripts/seed-bank-recon-test.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find the admin user Tan Mei Hua
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Tan Mei' } },
    select: { id: true, name: true, firm_id: true },
  });

  if (!user || !user.firm_id) {
    console.error('User "Tan Mei Hua" not found or has no firm');
    process.exit(1);
  }

  console.log(`Found user: ${user.name}, firm: ${user.firm_id}`);
  const firmId = user.firm_id;

  // Create test suppliers that match bank statement descriptions
  const supplierData = [
    { name: 'AXAI DIGITAL SDN BHD' },
    { name: 'AIA HEALTH SERVICES' },
    { name: 'AIA BHD.' },
    { name: 'WLP SOLUTIONS ENTERPRISE' },
    { name: 'BERJAYA SECURITIES SDN BHD' },
    { name: 'LEANIS SOLUTIONS SDN BHD' },
    { name: 'GRABPAY MALAYSIA' },
    { name: 'PAYRIGHT SDN. BHD.' },
    { name: 'LAU HSIN HUAT' },
    { name: 'LEONG TING HOONG' },
    { name: 'TOH WEI XIANG' },
  ];

  const suppliers: Record<string, string> = {};
  for (const s of supplierData) {
    const existing = await prisma.supplier.findFirst({
      where: { firm_id: firmId, name: s.name },
    });
    if (existing) {
      suppliers[s.name] = existing.id;
      console.log(`  Supplier exists: ${s.name}`);
    } else {
      const created = await prisma.supplier.create({
        data: { firm_id: firmId, name: s.name },
      });
      suppliers[s.name] = created.id;
      console.log(`  Created supplier: ${s.name}`);
    }
  }

  // Create payments that match specific bank statement transactions
  // These should auto-match by amount + date + supplier name
  const paymentData = [
    // Exact matches to bank txns
    { supplier: 'AXAI DIGITAL SDN BHD', amount: 100.00, date: '2026-02-02', direction: 'outgoing' as const, reference: '202602023722174' },
    { supplier: 'AIA HEALTH SERVICES', amount: 10.00, date: '2026-02-09', direction: 'outgoing' as const, reference: 'VA62972000' },
    { supplier: 'WLP SOLUTIONS ENTERPRISE', amount: 398.00, date: '2026-02-09', direction: 'outgoing' as const, reference: '26020930022661' },
    { supplier: 'AXAI DIGITAL SDN BHD', amount: 397.00, date: '2026-02-10', direction: 'outgoing' as const, reference: '202602109969708' },
    { supplier: 'AXAI DIGITAL SDN BHD', amount: 1189.00, date: '2026-02-10', direction: 'outgoing' as const, reference: null },
    { supplier: 'AIA BHD.', amount: 300.00, date: '2026-02-13', direction: 'outgoing' as const, reference: '0252167J02' },
    { supplier: 'LEONG TING HOONG', amount: 450.00, date: '2026-02-13', direction: 'outgoing' as const, reference: null },
    { supplier: 'LEANIS SOLUTIONS SDN BHD', amount: 1970.00, date: '2026-02-18', direction: 'outgoing' as const, reference: 'FPX1771419628R9P765' },
    { supplier: 'LEANIS SOLUTIONS SDN BHD', amount: 882.77, date: '2026-02-19', direction: 'outgoing' as const, reference: null },
    { supplier: 'AXAI DIGITAL SDN BHD', amount: 197.00, date: '2026-02-19', direction: 'outgoing' as const, reference: null },
    { supplier: 'TOH WEI XIANG', amount: 2575.88, date: '2026-02-16', direction: 'outgoing' as const, reference: null },
    { supplier: 'GRABPAY MALAYSIA', amount: 100.00, date: '2026-02-21', direction: 'outgoing' as const, reference: null },
    // Incoming payments
    { supplier: 'LAU HSIN HUAT', amount: 200.00, date: '2026-02-02', direction: 'incoming' as const, reference: null },
    { supplier: 'LAU HSIN HUAT', amount: 300.00, date: '2026-02-09', direction: 'incoming' as const, reference: null },
    { supplier: 'BERJAYA SECURITIES SDN BHD', amount: 12210.18, date: '2026-02-10', direction: 'incoming' as const, reference: null },
    { supplier: 'LAU HSIN HUAT', amount: 1300.00, date: '2026-02-10', direction: 'incoming' as const, reference: null },
    { supplier: 'PAYRIGHT SDN. BHD.', amount: 1934.00, date: '2026-02-16', direction: 'incoming' as const, reference: null },
  ];

  let created = 0;
  for (const p of paymentData) {
    const supplierId = suppliers[p.supplier];
    if (!supplierId) {
      console.error(`  Supplier not found: ${p.supplier}`);
      continue;
    }

    await prisma.payment.create({
      data: {
        firm_id: firmId,
        supplier_id: supplierId,
        amount: p.amount,
        payment_date: new Date(p.date),
        direction: p.direction,
        reference: p.reference,
        notes: `Test payment for bank recon - ${p.supplier}`,
      },
    });
    created++;
    console.log(`  Payment: ${p.direction} RM ${p.amount} to ${p.supplier} on ${p.date}`);
  }

  console.log(`\nDone! Created ${created} payments for firm ${firmId}`);
  console.log('Now re-upload the bank statement PDF or delete the existing one and re-upload to see auto-matching.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
