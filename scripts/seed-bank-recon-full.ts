/**
 * Seeds full test data: invoices + receipts linked to payments,
 * so bank reconciliation preview shows complete info.
 *
 * Usage: npx tsx scripts/seed-bank-recon-full.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findFirst({
    where: { name: { contains: 'Tan Mei' } },
    select: { id: true, name: true, firm_id: true },
  });
  if (!user || !user.firm_id) { console.error('User not found'); process.exit(1); }
  const firmId = user.firm_id;
  console.log(`Firm: ${firmId}`);

  // Get existing suppliers created by previous seed
  const suppliers = await prisma.supplier.findMany({
    where: { firm_id: firmId },
    select: { id: true, name: true },
  });
  const sup = (name: string) => suppliers.find(s => s.name.includes(name))?.id;

  // Get default category
  let category = await prisma.category.findFirst({ where: { firm_id: firmId } });
  if (!category) {
    category = await prisma.category.findFirst();
  }
  if (!category) { console.error('No category found'); process.exit(1); }
  console.log(`Category: ${category.name}`);

  // Get or create an employee for uploading
  let employee = await prisma.employee.findFirst({ where: { firm_id: firmId } });
  if (!employee) {
    employee = await prisma.employee.create({
      data: { name: 'System', phone: '+60000000000', firm_id: firmId },
    });
  }

  // Find existing payments from previous seed to link invoices/receipts
  const payments = await prisma.payment.findMany({
    where: { firm_id: firmId, notes: { contains: 'Test payment for bank recon' } },
    select: { id: true, supplier_id: true, amount: true, payment_date: true, direction: true },
    orderBy: { payment_date: 'asc' },
  });
  console.log(`Found ${payments.length} test payments to link`);

  let invoicesCreated = 0;
  let receiptsCreated = 0;
  let allocationsCreated = 0;
  let receiptLinksCreated = 0;

  for (const pmt of payments) {
    if (pmt.direction === 'outgoing') {
      // Create an invoice for this payment
      const inv = await prisma.invoice.create({
        data: {
          firm_id: firmId,
          supplier_id: pmt.supplier_id,
          invoice_number: `INV-${String(invoicesCreated + 1).padStart(4, '0')}`,
          issue_date: new Date(pmt.payment_date.getTime() - 7 * 86400000), // 7 days before payment
          due_date: new Date(pmt.payment_date.getTime() + 23 * 86400000), // 30 days after issue
          total_amount: Number(pmt.amount),
          subtotal: Number(pmt.amount),
          tax_amount: 0,
          amount_paid: Number(pmt.amount),
          payment_status: 'paid',
          status: 'reviewed',
          vendor_name_raw: suppliers.find(s => s.id === pmt.supplier_id)?.name ?? 'Unknown',
          category_id: category.id,
          uploaded_by: employee.id,
          confidence: 'HIGH',
          submitted_via: 'dashboard',
        },
      });
      invoicesCreated++;

      // Create payment allocation
      await prisma.paymentAllocation.create({
        data: {
          payment_id: pmt.id,
          invoice_id: inv.id,
          amount: Number(pmt.amount),
        },
      });
      allocationsCreated++;

      // Create a receipt (claim) for some payments
      if (invoicesCreated % 2 === 0) {
        const claim = await prisma.claim.create({
          data: {
            firm_id: firmId,
            employee_id: employee.id,
            claim_date: pmt.payment_date,
            merchant: suppliers.find(s => s.id === pmt.supplier_id)?.name ?? 'Unknown',
            amount: Number(pmt.amount),
            category_id: category.id,
            type: 'receipt',
            receipt_number: `RCP-${String(receiptsCreated + 1).padStart(4, '0')}`,
            payment_status: 'paid',
            status: 'reviewed',
            approval: 'approved',
            submitted_via: 'dashboard',
            confidence: 'HIGH',
          },
        });
        receiptsCreated++;

        await prisma.paymentReceipt.create({
          data: { payment_id: pmt.id, claim_id: claim.id },
        });
        receiptLinksCreated++;
      }
    }
  }

  console.log(`\nCreated:`);
  console.log(`  ${invoicesCreated} invoices`);
  console.log(`  ${allocationsCreated} payment allocations`);
  console.log(`  ${receiptsCreated} receipts`);
  console.log(`  ${receiptLinksCreated} receipt-payment links`);
  console.log(`\nNow delete the existing bank statement and re-upload to see full preview data.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
