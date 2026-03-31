import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get existing data
  const firms = await prisma.firm.findMany({ select: { id: true, name: true } });
  if (firms.length === 0) throw new Error('No firms found — run the main seed first');

  const employees = await prisma.employee.findMany({
    select: { id: true, name: true, firm_id: true },
  });

  const categories = await prisma.category.findMany({
    where: { firm_id: null, is_active: true },
    select: { id: true, name: true },
  });

  const catMap: Record<string, string> = {};
  for (const c of categories) catMap[c.name] = c.id;

  const catOffice = catMap['Office Expenses'] ?? categories[0].id;
  const catSoftware = catMap['Software & SaaS'] ?? categories[0].id;
  const catRepairs = catMap['Repairs & Maintenance'] ?? categories[0].id;
  const catUtils = catMap['Utilities'] ?? categories[0].id;
  const catProfSvc = catMap['Professional Services'] ?? categories[0].id;
  const catEquip = catMap['Equipment & Hardware'] ?? categories[0].id;
  const catRent = catMap['Rent & Facilities'] ?? categories[0].id;
  const catMisc = catMap['Miscellaneous'] ?? categories[0].id;

  const daysAgo = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const daysFromNow = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Create suppliers for each firm
  for (const firm of firms) {
    const firmEmployees = employees.filter((e) => e.firm_id === firm.id);
    if (firmEmployees.length === 0) {
      console.log(`  Skipping ${firm.name} — no employees`);
      continue;
    }

    const uploader = firmEmployees[0];

    console.log(`Creating suppliers for ${firm.name}...`);

    const supplierData = [
      { name: 'Syarikat Bekalan Pejabat', email: 'sales@bekalanpejabat.my', phone: '03-21234567' },
      { name: 'CloudTech Solutions', email: 'billing@cloudtech.my', phone: '03-98765432' },
      { name: 'Alam Flora Sdn Bhd', email: 'invoice@alamflora.my', phone: '03-55551234' },
      { name: 'Tenaga Nasional Berhad', email: 'billing@tnb.com.my', phone: '1300-88-5454' },
      { name: 'KL Office Rentals', email: 'accounts@klrentals.my', phone: '03-41234567' },
      { name: 'Rapid KL Maintenance', email: 'service@rapidmaint.my', phone: '03-76543210' },
    ];

    const suppliers = [];
    for (const sd of supplierData) {
      const existing = await prisma.supplier.findUnique({
        where: { firm_id_name: { firm_id: firm.id, name: sd.name } },
      });
      if (existing) {
        suppliers.push(existing);
      } else {
        const s = await prisma.supplier.create({
          data: {
            firm_id: firm.id,
            name: sd.name,
            contact_email: sd.email,
            contact_phone: sd.phone,
          },
        });
        suppliers.push(s);
      }
    }

    // Create aliases for auto-matching
    for (const s of suppliers) {
      const alias = s.name.toLowerCase().trim();
      await prisma.supplierAlias.upsert({
        where: { supplier_id_alias: { supplier_id: s.id, alias } },
        update: {},
        create: { supplier_id: s.id, alias, is_confirmed: true },
      });
    }

    console.log(`  Created ${suppliers.length} suppliers`);

    // Create invoices
    const invoices = [
      // Paid invoices
      {
        supplier: suppliers[0], vendor: 'Syarikat Bekalan Pejabat', invoiceNum: 'SBP-2026-0412',
        issueDate: daysAgo(45), dueDate: daysAgo(15), paymentTerms: 'Net 30',
        subtotal: 2800, tax: 168, total: 2968, amountPaid: 2968,
        category: catOffice, status: 'reviewed' as const, paymentStatus: 'paid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      {
        supplier: suppliers[1], vendor: 'CloudTech Solutions', invoiceNum: 'CT-2026-1001',
        issueDate: daysAgo(60), dueDate: daysAgo(30), paymentTerms: 'Net 30',
        subtotal: 4500, tax: 270, total: 4770, amountPaid: 4770,
        category: catSoftware, status: 'reviewed' as const, paymentStatus: 'paid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      // Partially paid
      {
        supplier: suppliers[3], vendor: 'Tenaga Nasional Berhad', invoiceNum: 'TNB-2026-MAR',
        issueDate: daysAgo(20), dueDate: daysAgo(5), paymentTerms: 'Net 14',
        subtotal: 1850, tax: 0, total: 1850, amountPaid: 1000,
        category: catUtils, status: 'reviewed' as const, paymentStatus: 'partially_paid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      // Unpaid — current (not yet due)
      {
        supplier: suppliers[4], vendor: 'KL Office Rentals', invoiceNum: 'KLOR-2026-04',
        issueDate: daysAgo(5), dueDate: daysFromNow(25), paymentTerms: 'Net 30',
        subtotal: 8500, tax: 510, total: 9010, amountPaid: 0,
        category: catRent, status: 'reviewed' as const, paymentStatus: 'unpaid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      {
        supplier: suppliers[1], vendor: 'CloudTech Solutions', invoiceNum: 'CT-2026-1102',
        issueDate: daysAgo(3), dueDate: daysFromNow(27), paymentTerms: 'Net 30',
        subtotal: 4500, tax: 270, total: 4770, amountPaid: 0,
        category: catSoftware, status: 'pending_review' as const, paymentStatus: 'unpaid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      // Unpaid — overdue
      {
        supplier: suppliers[5], vendor: 'Rapid KL Maintenance', invoiceNum: 'RKM-2026-0087',
        issueDate: daysAgo(50), dueDate: daysAgo(20), paymentTerms: 'Net 30',
        subtotal: 3200, tax: 192, total: 3392, amountPaid: 0,
        category: catRepairs, status: 'reviewed' as const, paymentStatus: 'unpaid' as const,
        confidence: 'MEDIUM' as const, linkStatus: 'confirmed' as const,
      },
      {
        supplier: suppliers[0], vendor: 'Syarikat Bekalan Pejabat', invoiceNum: 'SBP-2026-0498',
        issueDate: daysAgo(35), dueDate: daysAgo(5), paymentTerms: 'Net 30',
        subtotal: 1450, tax: 87, total: 1537, amountPaid: 0,
        category: catOffice, status: 'pending_review' as const, paymentStatus: 'unpaid' as const,
        confidence: 'HIGH' as const, linkStatus: 'confirmed' as const,
      },
      // Unmatched supplier
      {
        supplier: null, vendor: 'Ace Hardware Supply KL', invoiceNum: 'AHS-26-0034',
        issueDate: daysAgo(7), dueDate: daysFromNow(23), paymentTerms: 'Net 30',
        subtotal: 650, tax: 39, total: 689, amountPaid: 0,
        category: catEquip, status: 'pending_review' as const, paymentStatus: 'unpaid' as const,
        confidence: 'LOW' as const, linkStatus: 'unmatched' as const,
      },
      // Auto-matched supplier
      {
        supplier: suppliers[2], vendor: 'Alam Flora Waste Mgmt', invoiceNum: 'AF-2026-0312',
        issueDate: daysAgo(12), dueDate: daysFromNow(18), paymentTerms: 'Net 30',
        subtotal: 780, tax: 46.8, total: 826.8, amountPaid: 0,
        category: catMisc, status: 'pending_review' as const, paymentStatus: 'unpaid' as const,
        confidence: 'MEDIUM' as const, linkStatus: 'auto_matched' as const,
      },
      // Professional services — overdue 90+
      {
        supplier: null, vendor: 'Azman & Co Legal', invoiceNum: 'ACL-2025-1288',
        issueDate: daysAgo(120), dueDate: daysAgo(90), paymentTerms: 'Net 30',
        subtotal: 12000, tax: 720, total: 12720, amountPaid: 0,
        category: catProfSvc, status: 'reviewed' as const, paymentStatus: 'unpaid' as const,
        confidence: 'HIGH' as const, linkStatus: 'unmatched' as const,
      },
    ];

    let created = 0;
    for (const inv of invoices) {
      await prisma.invoice.create({
        data: {
          firm_id: firm.id,
          uploaded_by: uploader.id,
          supplier_id: inv.supplier?.id ?? null,
          supplier_link_status: inv.linkStatus,
          vendor_name_raw: inv.vendor,
          invoice_number: inv.invoiceNum,
          issue_date: inv.issueDate,
          due_date: inv.dueDate,
          payment_terms: inv.paymentTerms,
          subtotal: inv.subtotal,
          tax_amount: inv.tax,
          total_amount: inv.total,
          amount_paid: inv.amountPaid,
          category_id: inv.category,
          confidence: inv.confidence,
          status: inv.status,
          payment_status: inv.paymentStatus,
          submitted_via: 'dashboard',
        },
      });
      created++;
    }

    console.log(`  Created ${created} invoices`);
  }

  console.log('\nDone! Invoice test data created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
