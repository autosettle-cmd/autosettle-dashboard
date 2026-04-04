/**
 * Create test payment data for Tech Solutions Sdn Bhd to match the WhatsApp-uploaded bank statement.
 * Also prints the transactions so we know what to match.
 *
 * Usage: npx tsx scripts/seed-tech-solutions-recon.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const firm = await prisma.firm.findFirst({ where: { name: { contains: 'Tech Solutions' } }, select: { id: true, name: true } });
  if (!firm) { console.error('Tech Solutions not found'); process.exit(1); }
  console.log(`Firm: ${firm.name} (${firm.id})`);

  // Get bank statement transactions
  const stmt = await prisma.bankStatement.findFirst({
    where: { firm_id: firm.id },
    include: { transactions: { orderBy: { transaction_date: 'asc' } } },
  });
  if (!stmt) { console.error('No bank statement found'); process.exit(1); }
  console.log(`Statement: ${stmt.bank_name} ${stmt.account_number} — ${stmt.transactions.length} transactions\n`);

  // Print all transactions
  stmt.transactions.forEach((t, i) => {
    const amt = t.debit ? `D:${t.debit}` : `C:${t.credit}`;
    console.log(`${i + 1}. ${t.transaction_date.toISOString().split('T')[0]} | ${t.description.substring(0, 50).padEnd(50)} | ${amt}`);
  });

  // Get or create category
  let category = await prisma.category.findFirst({ where: { firm_id: firm.id } });
  if (!category) category = await prisma.category.findFirst();
  if (!category) { console.error('No category'); process.exit(1); }

  // Get or create employee
  let employee = await prisma.employee.findFirst({ where: { firm_id: firm.id } });
  if (!employee) {
    employee = await prisma.employee.create({ data: { name: 'System', phone: '+60000000001', firm_id: firm.id } });
  }

  // Create suppliers and payments matching ~15 of the bank transactions
  const records = [
    // Outgoing payments (debits on bank statement)
    { sup: 'AXAI DIGITAL SDN BHD',      amt: 100.00,    date: '2026-02-02', dir: 'outgoing' as const, ref: '202602023722174', inv: 'TS-INV-001', desc: 'Digital subscription' },
    { sup: 'AIA HEALTH SERVICES',        amt: 10.00,     date: '2026-02-09', dir: 'outgoing' as const, ref: 'VA62972000',      inv: 'TS-INV-002', desc: 'Health screening', hasReceipt: true },
    { sup: 'WLP SOLUTIONS ENTERPRISE',   amt: 398.00,    date: '2026-02-09', dir: 'outgoing' as const, ref: '26020930022661',  inv: 'TS-INV-003', desc: 'IT support Feb' },
    { sup: 'AXAI DIGITAL SDN BHD',       amt: 397.00,    date: '2026-02-10', dir: 'outgoing' as const, ref: '202602109969708', inv: 'TS-INV-004', desc: 'Software license' },
    { sup: 'AXAI DIGITAL SDN BHD',       amt: 1189.00,   date: '2026-02-10', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-005', desc: 'Cloud hosting Q1', hasReceipt: true },
    { sup: 'AIA BHD.',                   amt: 300.00,    date: '2026-02-13', dir: 'outgoing' as const, ref: '0252167J02',      inv: 'TS-INV-006', desc: 'Insurance premium', hasReceipt: true },
    { sup: 'LEONG TING HOONG',           amt: 450.00,    date: '2026-02-13', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-007', desc: 'Freelance consulting' },
    { sup: 'LEANIS SOLUTIONS SDN BHD',   amt: 1970.00,   date: '2026-02-18', dir: 'outgoing' as const, ref: 'FPX1771419628',  inv: 'TS-INV-008', desc: 'Accounting software', hasReceipt: true },
    { sup: 'LEANIS SOLUTIONS SDN BHD',   amt: 882.77,    date: '2026-02-19', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-009', desc: 'Payroll processing Feb' },
    { sup: 'AXAI DIGITAL SDN BHD',       amt: 197.00,    date: '2026-02-19', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-010', desc: 'API usage overage' },
    { sup: 'TOH WEI XIANG',              amt: 2575.88,   date: '2026-02-16', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-011', desc: 'Office renovation', hasReceipt: true },
    { sup: 'KLB SUKAN & REKREASI',       amt: 12.00,     date: '2026-02-12', dir: 'outgoing' as const, ref: null,              inv: 'TS-INV-012', desc: 'Sports club scrip' },
    // Incoming payments (credits on bank statement)
    { sup: 'LAU HSIN HUAT',              amt: 200.00,    date: '2026-02-02', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Owner top-up' },
    { sup: 'LAU HSIN HUAT',              amt: 300.00,    date: '2026-02-09', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Owner top-up' },
    { sup: 'BERJAYA SECURITIES SDN BHD', amt: 12210.18,  date: '2026-02-10', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Investment returns', hasReceipt: true },
    { sup: 'TAN FOOK YEW',               amt: 21181.00,  date: '2026-02-11', dir: 'incoming' as const, ref: null,              inv: null, desc: 'CNY dinner budget' },
    { sup: 'LAU TEIK HOCK',              amt: 10000.00,  date: '2026-02-13', dir: 'incoming' as const, ref: null,              inv: null, desc: 'Loan return' },
  ];

  // Create suppliers
  const suppliers: Record<string, string> = {};
  const allSupNames = [...new Set(records.map(r => r.sup))];
  for (const name of allSupNames) {
    const existing = await prisma.supplier.findFirst({ where: { firm_id: firm.id, name } });
    if (existing) { suppliers[name] = existing.id; continue; }
    const created = await prisma.supplier.create({ data: { firm_id: firm.id, name } });
    suppliers[name] = created.id;
  }
  console.log(`\n${Object.keys(suppliers).length} suppliers ready`);

  let pmtCount = 0, invCount = 0, rcpCount = 0;
  for (const r of records) {
    const supplierId = suppliers[r.sup];
    if (!supplierId) continue;

    const payment = await prisma.payment.create({
      data: {
        firm_id: firm.id,
        supplier_id: supplierId,
        amount: r.amt,
        payment_date: new Date(r.date),
        direction: r.dir,
        reference: r.ref,
        notes: `Test payment for bank recon - ${r.desc}`,
      },
    });
    pmtCount++;

    if (r.inv && r.dir === 'outgoing') {
      const issueDate = new Date(new Date(r.date).getTime() - 7 * 86400000);
      const inv = await prisma.invoice.create({
        data: {
          firm_id: firm.id, supplier_id: supplierId, invoice_number: r.inv,
          issue_date: issueDate, due_date: new Date(issueDate.getTime() + 30 * 86400000),
          total_amount: r.amt, subtotal: r.amt, tax_amount: 0, amount_paid: r.amt,
          payment_status: 'paid', status: 'reviewed', vendor_name_raw: r.sup,
          category_id: category.id, uploaded_by: employee.id, confidence: 'HIGH', submitted_via: 'dashboard',
        },
      });
      await prisma.paymentAllocation.create({ data: { payment_id: payment.id, invoice_id: inv.id, amount: r.amt } });
      invCount++;
    }

    if (r.hasReceipt) {
      const claim = await prisma.claim.create({
        data: {
          firm_id: firm.id, employee_id: employee.id, claim_date: new Date(r.date),
          merchant: r.sup, description: r.desc, amount: r.amt, category_id: category.id,
          type: 'receipt', receipt_number: `TS-RCP-${String(rcpCount + 1).padStart(3, '0')}`,
          payment_status: 'paid', status: 'reviewed', approval: 'approved',
          submitted_via: 'dashboard', confidence: 'HIGH',
        },
      });
      await prisma.paymentReceipt.create({ data: { payment_id: payment.id, claim_id: claim.id } });
      rcpCount++;
    }
  }

  console.log(`\nCreated: ${pmtCount} payments, ${invCount} invoices, ${rcpCount} receipts`);

  // Now re-run auto-matching on the existing bank statement
  const { autoMatchTransactions } = await import('../lib/bank-reconciliation');
  const matchResult = await autoMatchTransactions(firm.id, stmt.id);
  console.log(`\nAuto-match results: ${matchResult.matched} matched, ${matchResult.unmatched} unmatched`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
