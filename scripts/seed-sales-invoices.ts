import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seed() {
  const invoices = [
    // Tech Solutions Sdn Bhd - 5 invoices
    {
      firm_id: 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc',
      supplier_id: '71f0c368-b0cd-4da6-a3bb-4d758f0ae681',
      created_by: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      invoice_number: 'SI-2026-001',
      issue_date: new Date('2026-03-15'),
      due_date: new Date('2026-04-15'),
      subtotal: 5000,
      tax_amount: 300,
      total_amount: 5300,
      lhdn_status: 'valid' as const,
      lhdn_qr_url: 'https://myinvois.hasil.gov.my/test/share/abc123',
      lhdn_submitted_at: new Date('2026-03-15'),
      lhdn_validated_at: new Date('2026-03-15'),
      notes: 'IT consulting services for Q1',
      items: [
        { description: 'IT Consulting - March', quantity: 40, unit_price: 100, tax_rate: 6, tax_amount: 240, line_total: 4240, discount: 0, sort_order: 0 },
        { description: 'Server maintenance', quantity: 1, unit_price: 1000, tax_rate: 6, tax_amount: 60, line_total: 1060, discount: 0, sort_order: 1 },
      ],
    },
    {
      firm_id: 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc',
      supplier_id: 'c187e990-2b40-4f6c-9c81-d2085601d353',
      created_by: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      invoice_number: 'SI-2026-002',
      issue_date: new Date('2026-03-20'),
      due_date: new Date('2026-04-20'),
      subtotal: 2400,
      tax_amount: 144,
      total_amount: 2544,
      lhdn_status: 'draft' as const,
      notes: 'Office furniture supply',
      items: [
        { description: 'Executive desk', quantity: 2, unit_price: 800, tax_rate: 6, tax_amount: 96, line_total: 1696, discount: 0, sort_order: 0 },
        { description: 'Office chair', quantity: 4, unit_price: 200, tax_rate: 6, tax_amount: 48, line_total: 848, discount: 0, sort_order: 1 },
      ],
    },
    {
      firm_id: 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc',
      supplier_id: '346e8a1f-f900-4aa0-87a8-faa7af96acd5',
      created_by: '3595f30c-9b94-4c25-965d-d2f133fef6df',
      invoice_number: 'SI-2026-003',
      issue_date: new Date('2026-03-25'),
      due_date: new Date('2026-04-25'),
      subtotal: 12000,
      tax_amount: 720,
      total_amount: 12720,
      lhdn_status: 'pending' as const,
      lhdn_submitted_at: new Date('2026-03-26'),
      lhdn_submission_uid: 'SUB-TEST-001',
      items: [
        { description: 'Cloud hosting - Annual plan', quantity: 1, unit_price: 8000, tax_rate: 6, tax_amount: 480, line_total: 8480, discount: 0, sort_order: 0 },
        { description: 'SSL certificates (5 domains)', quantity: 5, unit_price: 400, tax_rate: 6, tax_amount: 120, line_total: 2120, discount: 0, sort_order: 1 },
        { description: 'Data backup service', quantity: 12, unit_price: 100, tax_rate: 6, tax_amount: 72, line_total: 1272, discount: 0, sort_order: 2 },
      ],
    },
    {
      firm_id: 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc',
      supplier_id: 'f4dbcb33-cd43-4364-913f-66404c3ade2a',
      created_by: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      invoice_number: 'SI-2026-004',
      issue_date: new Date('2026-02-10'),
      due_date: new Date('2026-03-10'),
      subtotal: 3500,
      tax_amount: 0,
      total_amount: 3500,
      payment_status: 'paid' as const,
      amount_paid: 3500,
      lhdn_status: 'valid' as const,
      lhdn_qr_url: 'https://myinvois.hasil.gov.my/test/share/def456',
      lhdn_submitted_at: new Date('2026-02-10'),
      lhdn_validated_at: new Date('2026-02-11'),
      notes: 'Waste management contract - Feb',
      items: [
        { description: 'Waste collection service - Feb', quantity: 1, unit_price: 2500, tax_rate: 0, tax_amount: 0, line_total: 2500, discount: 0, sort_order: 0 },
        { description: 'Recycling service - Feb', quantity: 1, unit_price: 1000, tax_rate: 0, tax_amount: 0, line_total: 1000, discount: 0, sort_order: 1 },
      ],
    },
    {
      firm_id: 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc',
      supplier_id: '71f0c368-b0cd-4da6-a3bb-4d758f0ae681',
      created_by: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      invoice_number: 'SI-2026-005',
      issue_date: new Date('2026-01-05'),
      due_date: new Date('2026-02-05'),
      subtotal: 8500,
      tax_amount: 510,
      total_amount: 9010,
      payment_status: 'partially_paid' as const,
      amount_paid: 5000,
      lhdn_status: 'valid' as const,
      lhdn_qr_url: 'https://myinvois.hasil.gov.my/test/share/ghi789',
      lhdn_submitted_at: new Date('2026-01-05'),
      lhdn_validated_at: new Date('2026-01-06'),
      items: [
        { description: 'Architectural design - Phase 1', quantity: 1, unit_price: 5000, tax_rate: 6, tax_amount: 300, line_total: 5300, discount: 0, sort_order: 0 },
        { description: 'Structural assessment', quantity: 1, unit_price: 3500, tax_rate: 6, tax_amount: 210, line_total: 3710, discount: 0, sort_order: 1 },
      ],
    },
    // Retail Mart Sdn Bhd - 3 invoices
    {
      firm_id: 'd591d195-db07-4225-a934-5a98d1238865',
      supplier_id: 'f789fa13-4c19-4b4d-ba76-22366d18f0e0',
      created_by: '636602f8-c83e-4312-8af4-72c0a207ae62',
      invoice_number: 'RM-INV-001',
      issue_date: new Date('2026-03-18'),
      due_date: new Date('2026-04-18'),
      subtotal: 1500,
      tax_amount: 90,
      total_amount: 1590,
      lhdn_status: 'draft' as const,
      items: [
        { description: 'Stationery supply - March', quantity: 50, unit_price: 20, tax_rate: 6, tax_amount: 60, line_total: 1060, discount: 0, sort_order: 0 },
        { description: 'Printer cartridges', quantity: 10, unit_price: 50, tax_rate: 6, tax_amount: 30, line_total: 530, discount: 0, sort_order: 1 },
      ],
    },
    {
      firm_id: 'd591d195-db07-4225-a934-5a98d1238865',
      supplier_id: '9a1dd0f1-259f-4c1e-89fd-48d51084ef62',
      created_by: '636602f8-c83e-4312-8af4-72c0a207ae62',
      invoice_number: 'RM-INV-002',
      issue_date: new Date('2026-03-01'),
      due_date: new Date('2026-04-01'),
      subtotal: 4800,
      tax_amount: 288,
      total_amount: 5088,
      lhdn_status: 'invalid' as const,
      lhdn_error: 'Buyer TIN not found in LHDN records. Please verify buyer tax identification.',
      lhdn_submitted_at: new Date('2026-03-02'),
      items: [
        { description: 'POS system license - Annual', quantity: 3, unit_price: 1200, tax_rate: 6, tax_amount: 216, line_total: 3816, discount: 0, sort_order: 0 },
        { description: 'POS hardware maintenance', quantity: 3, unit_price: 400, tax_rate: 6, tax_amount: 72, line_total: 1272, discount: 0, sort_order: 1 },
      ],
    },
    {
      firm_id: 'd591d195-db07-4225-a934-5a98d1238865',
      supplier_id: '26220ce1-f741-4229-8e41-129b527bf1ec',
      created_by: '636602f8-c83e-4312-8af4-72c0a207ae62',
      invoice_number: 'RM-INV-003',
      issue_date: new Date('2026-02-15'),
      due_date: new Date('2026-03-15'),
      subtotal: 750,
      tax_amount: 0,
      total_amount: 750,
      payment_status: 'paid' as const,
      amount_paid: 750,
      lhdn_status: 'valid' as const,
      lhdn_qr_url: 'https://myinvois.hasil.gov.my/test/share/jkl012',
      lhdn_submitted_at: new Date('2026-02-15'),
      lhdn_validated_at: new Date('2026-02-16'),
      items: [
        { description: 'Electrical installation - Store B', quantity: 1, unit_price: 750, tax_rate: 0, tax_amount: 0, line_total: 750, discount: 0, sort_order: 0 },
      ],
    },
  ];

  for (const inv of invoices) {
    const { items, ...invoiceData } = inv;
    await prisma.salesInvoice.create({
      data: {
        ...invoiceData,
        items: { create: items },
      },
    });
    console.log('Created:', inv.invoice_number);
  }

  console.log(`Done! Created ${invoices.length} sales invoices`);
  await prisma.$disconnect();
}

seed().catch(console.error);
