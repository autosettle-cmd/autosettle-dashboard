/**
 * Cleans up old test data and re-seeds with genuine, non-duplicate data.
 *
 * Usage: npx tsx scripts/reset-bank-recon-test.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Tan Mei' } },
    select: { id: true, firm_id: true },
  });
  if (!user?.firm_id) { console.error('User not found'); process.exit(1); }
  const firmId = user.firm_id;

  // ── 1. Clean up old test data ──
  console.log('Cleaning up old test data...');

  // Delete bank statements (cascades to transactions)
  const deleted = await prisma.bankStatement.deleteMany({ where: { firm_id: firmId } });
  console.log(`  Deleted ${deleted.count} bank statements`);

  // Find test payments
  const testPayments = await prisma.payment.findMany({
    where: { firm_id: firmId, notes: { contains: 'Test payment for bank recon' } },
    select: { id: true },
  });
  const testPaymentIds = testPayments.map(p => p.id);

  if (testPaymentIds.length > 0) {
    // Delete receipt links and claims
    const receiptLinks = await prisma.paymentReceipt.findMany({
      where: { payment_id: { in: testPaymentIds } },
      select: { claim_id: true },
    });
    await prisma.paymentReceipt.deleteMany({ where: { payment_id: { in: testPaymentIds } } });
    if (receiptLinks.length > 0) {
      await prisma.claim.deleteMany({ where: { id: { in: receiptLinks.map(r => r.claim_id) } } });
    }

    // Delete allocations and invoices
    const allocations = await prisma.paymentAllocation.findMany({
      where: { payment_id: { in: testPaymentIds } },
      select: { invoice_id: true },
    });
    await prisma.paymentAllocation.deleteMany({ where: { payment_id: { in: testPaymentIds } } });
    if (allocations.length > 0) {
      await prisma.invoice.deleteMany({ where: { id: { in: allocations.map(a => a.invoice_id) } } });
    }

    // Delete payments themselves
    await prisma.payment.deleteMany({ where: { id: { in: testPaymentIds } } });
    console.log(`  Deleted ${testPaymentIds.length} test payments and linked records`);
  }

  // Delete test suppliers that have no other records
  const testSupplierNames = [
    'AXAI DIGITAL SDN BHD', 'AIA HEALTH SERVICES', 'AIA BHD.',
    'WLP SOLUTIONS ENTERPRISE', 'BERJAYA SECURITIES SDN BHD',
    'LEANIS SOLUTIONS SDN BHD', 'GRABPAY MALAYSIA', 'PAYRIGHT SDN. BHD.',
    'LAU HSIN HUAT', 'LEONG TING HOONG', 'TOH WEI XIANG',
  ];
  for (const name of testSupplierNames) {
    const sup = await prisma.supplier.findFirst({ where: { firm_id: firmId, name } });
    if (!sup) continue;
    const hasOther = await prisma.payment.count({ where: { supplier_id: sup.id } });
    const hasInv = await prisma.invoice.count({ where: { supplier_id: sup.id } });
    if (hasOther === 0 && hasInv === 0) {
      await prisma.supplierAlias.deleteMany({ where: { supplier_id: sup.id } });
      await prisma.supplier.delete({ where: { id: sup.id } });
    }
  }
  console.log('  Cleaned up orphan suppliers');

  // ── 2. Re-seed with genuine data ──
  console.log('\nSeeding fresh data...');

  const category = await prisma.category.findFirst({ where: { firm_id: firmId } })
    ?? await prisma.category.findFirst();
  if (!category) { console.error('No category'); process.exit(1); }

  let employee = await prisma.employee.findFirst({ where: { firm_id: firmId } });
  if (!employee) {
    employee = await prisma.employee.create({ data: { name: 'System', phone: '+60000000000', firm_id: firmId } });
  }

  // Create suppliers
  const supData = [
    'AXAI DIGITAL SDN BHD', 'AIA HEALTH SERVICES', 'AIA BHD.',
    'WLP SOLUTIONS ENTERPRISE', 'BERJAYA SECURITIES SDN BHD',
    'LEANIS SOLUTIONS SDN BHD', 'GRABPAY MALAYSIA', 'PAYRIGHT SDN. BHD.',
    'LAU HSIN HUAT', 'LEONG TING HOONG', 'TOH WEI XIANG',
    'SAW SOON LEONG', 'LEE PUI YAO', 'TAN FOOK YEW', 'LAU TEIK HOCK',
  ];
  const suppliers: Record<string, string> = {};
  for (const name of supData) {
    const existing = await prisma.supplier.findFirst({ where: { firm_id: firmId, name } });
    if (existing) { suppliers[name] = existing.id; continue; }
    const created = await prisma.supplier.create({ data: { firm_id: firmId, name } });
    suppliers[name] = created.id;
  }
  console.log(`  ${Object.keys(suppliers).length} suppliers ready`);

  // Payment records that match the bank statement transactions
  // Each has unique invoice + some have receipts
  const records = [
    { sup: 'AXAI DIGITAL SDN BHD',     amt: 100.00,    date: '2026-02-02', dir: 'outgoing' as const, ref: '202602023722174', inv: 'INV-2026-0201', desc: 'Digital subscription Feb' },
    { sup: 'AIA HEALTH SERVICES',       amt: 10.00,     date: '2026-02-09', dir: 'outgoing' as const, ref: 'VA62972000',      inv: 'INV-2026-0202', desc: 'Health screening service', hasReceipt: true },
    { sup: 'WLP SOLUTIONS ENTERPRISE',  amt: 398.00,    date: '2026-02-09', dir: 'outgoing' as const, ref: '26020930022661',  inv: 'INV-2026-0203', desc: 'IT support services Feb' },
    { sup: 'AXAI DIGITAL SDN BHD',      amt: 397.00,    date: '2026-02-10', dir: 'outgoing' as const, ref: '202602109969708', inv: 'INV-2026-0204', desc: 'Software license renewal' },
    { sup: 'AXAI DIGITAL SDN BHD',      amt: 1189.00,   date: '2026-02-10', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0205', desc: 'Cloud hosting Q1', hasReceipt: true },
    { sup: 'AIA BHD.',                  amt: 300.00,    date: '2026-02-13', dir: 'outgoing' as const, ref: '0252167J02',      inv: 'INV-2026-0206', desc: 'Group insurance premium', hasReceipt: true },
    { sup: 'LEONG TING HOONG',          amt: 450.00,    date: '2026-02-13', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0207', desc: 'Freelance consulting' },
    { sup: 'LEANIS SOLUTIONS SDN BHD',  amt: 1970.00,   date: '2026-02-18', dir: 'outgoing' as const, ref: 'FPX1771419628',  inv: 'INV-2026-0208', desc: 'Accounting software annual', hasReceipt: true },
    { sup: 'LEANIS SOLUTIONS SDN BHD',  amt: 882.77,    date: '2026-02-19', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0209', desc: 'Payroll processing Feb' },
    { sup: 'AXAI DIGITAL SDN BHD',      amt: 197.00,    date: '2026-02-19', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0210', desc: 'API usage overage' },
    { sup: 'TOH WEI XIANG',             amt: 2575.88,   date: '2026-02-16', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0211', desc: 'Office renovation deposit', hasReceipt: true },
    { sup: 'SAW SOON LEONG',            amt: 72.00,     date: '2026-02-14', dir: 'outgoing' as const, ref: null,              inv: 'INV-2026-0212', desc: 'Transport reimbursement' },
    // Incoming
    { sup: 'LAU HSIN HUAT',             amt: 200.00,    date: '2026-02-02', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Capital injection' },
    { sup: 'LAU HSIN HUAT',             amt: 300.00,    date: '2026-02-09', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Owner top-up' },
    { sup: 'BERJAYA SECURITIES SDN BHD', amt: 12210.18, date: '2026-02-10', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Investment returns', hasReceipt: true },
    { sup: 'LAU HSIN HUAT',             amt: 1300.00,   date: '2026-02-10', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Owner top-up' },
    { sup: 'PAYRIGHT SDN. BHD.',        amt: 1934.00,   date: '2026-02-16', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Customer payment collection' },
    { sup: 'TAN FOOK YEW',              amt: 21181.00,  date: '2026-02-11', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Chinese New Year dinner budget' },
    { sup: 'LAU TEIK HOCK',             amt: 10000.00,  date: '2026-02-13', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Loan return' },
    { sup: 'LAU HSIN HUAT',             amt: 350.00,    date: '2026-02-10', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Owner top-up' },
  ];

  let pmtCount = 0, invCount = 0, rcpCount = 0;

  for (const r of records) {
    const supplierId = suppliers[r.sup];
    if (!supplierId) { console.error(`  Missing supplier: ${r.sup}`); continue; }

    const payment = await prisma.payment.create({
      data: {
        firm_id: firmId,
        supplier_id: supplierId,
        amount: r.amt,
        payment_date: new Date(r.date),
        direction: r.dir,
        reference: r.ref,
        notes: `Test payment for bank recon - ${r.desc}`,
      },
    });
    pmtCount++;

    // Create invoice for outgoing payments
    if (r.inv && r.dir === 'outgoing') {
      const issueDate = new Date(new Date(r.date).getTime() - 7 * 86400000);
      const inv = await prisma.invoice.create({
        data: {
          firm_id: firmId,
          supplier_id: supplierId,
          invoice_number: r.inv,
          issue_date: issueDate,
          due_date: new Date(issueDate.getTime() + 30 * 86400000),
          total_amount: r.amt,
          subtotal: r.amt,
          tax_amount: 0,
          amount_paid: r.amt,
          payment_status: 'paid',
          status: 'reviewed',
          vendor_name_raw: r.sup,
          category_id: category.id,
          uploaded_by: employee.id,
          confidence: 'HIGH',
          submitted_via: 'dashboard',
        },
      });
      await prisma.paymentAllocation.create({
        data: { payment_id: payment.id, invoice_id: inv.id, amount: r.amt },
      });
      invCount++;
    }

    // Create receipt for selected payments
    if (r.hasReceipt) {
      const claim = await prisma.claim.create({
        data: {
          firm_id: firmId,
          employee_id: employee.id,
          claim_date: new Date(r.date),
          merchant: r.sup,
          description: r.desc,
          amount: r.amt,
          category_id: category.id,
          type: 'receipt',
          receipt_number: `RCP-${r.date.replace(/-/g, '').slice(2)}-${String(rcpCount + 1).padStart(2, '0')}`,
          payment_status: 'paid',
          status: 'reviewed',
          approval: 'approved',
          submitted_via: 'dashboard',
          confidence: 'HIGH',
        },
      });
      await prisma.paymentReceipt.create({
        data: { payment_id: payment.id, claim_id: claim.id },
      });
      rcpCount++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  ${pmtCount} payments`);
  console.log(`  ${invCount} invoices (unique numbers)`);
  console.log(`  ${rcpCount} receipts`);
  console.log(`\nRe-upload the bank statement PDF to see auto-matching.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
