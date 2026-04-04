import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seed() {
  const firmId = 'd591d195-db07-4225-a934-5a98d1238865'; // Retail Mart
  const categoryOffice = '5cfc9d71-b35a-41c5-b5bb-c73e2b933361';
  const categoryRent = '55e6f1b2-4aa6-4e2b-9f33-881ef065a2d7';
  const categorySoftware = '7e1c4d43-17df-4d93-8f04-4c56c1ddc62f';
  const categoryRepairs = '622692eb-1050-40b4-af9f-aca6250215d3';
  const categoryComm = '17bb321c-849d-446c-8dfd-2ca8e919ebca';

  const receipts = [
    {
      employee_id: '636602f8-c83e-4312-8af4-72c0a207ae62', // Mei Ling
      claim_date: new Date('2026-03-30'),
      merchant: 'Tenaga Nasional Berhad',
      description: 'Electricity bill payment - remaining balance',
      receipt_number: 'RM-TNB-RCP-001',
      amount: 850,
      category_id: categoryRent,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '636602f8-c83e-4312-8af4-72c0a207ae62',
      claim_date: new Date('2026-03-28'),
      merchant: 'KL Office Rentals',
      description: 'Office rent payment - April',
      receipt_number: 'RM-KLOR-RCP-001',
      amount: 9010,
      category_id: categoryRent,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '6988d28f-3044-4824-a151-c94583117c3a', // richie lee
      claim_date: new Date('2026-03-25'),
      merchant: 'CloudTech Solutions',
      description: 'IT service payment - annual support',
      receipt_number: 'RM-CTS-RCP-001',
      amount: 4770,
      category_id: categorySoftware,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '6988d28f-3044-4824-a151-c94583117c3a',
      claim_date: new Date('2026-03-22'),
      merchant: 'Rapid KL Maintenance',
      description: 'Store maintenance - March service',
      receipt_number: 'RM-RKM-RCP-001',
      amount: 3392,
      category_id: categoryRepairs,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '50f9f7bb-7233-436a-b127-c5dafb1cc1bd', // jeff liiii
      claim_date: new Date('2026-03-20'),
      merchant: 'Syarikat Bekalan Pejabat',
      description: 'Office supplies - printer paper & toner',
      receipt_number: 'RM-SBP-RCP-001',
      amount: 1537,
      category_id: categoryOffice,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '636602f8-c83e-4312-8af4-72c0a207ae62',
      claim_date: new Date('2026-03-18'),
      merchant: 'Alam Flora Sdn Bhd',
      description: 'Waste management - March',
      receipt_number: 'RM-AF-RCP-001',
      amount: 826.80,
      category_id: categoryRepairs,
      confidence: 'MEDIUM' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '50f9f7bb-7233-436a-b127-c5dafb1cc1bd',
      claim_date: new Date('2026-03-15'),
      merchant: 'CloudTech Solutions',
      description: 'Hardware purchase - POS terminal',
      receipt_number: 'RM-CTS-RCP-002',
      amount: 689,
      category_id: categorySoftware,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '6988d28f-3044-4824-a151-c94583117c3a',
      claim_date: new Date('2026-03-29'),
      merchant: 'Digi Business',
      description: 'Mobile plan - store lines',
      receipt_number: 'RM-DIGI-RCP-001',
      amount: 450,
      category_id: categoryComm,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '636602f8-c83e-4312-8af4-72c0a207ae62',
      claim_date: new Date('2026-03-27'),
      merchant: 'CIMB Bank',
      description: 'Bank charges - March',
      receipt_number: 'RM-CIMB-RCP-001',
      amount: 85,
      category_id: '66172e19-8475-4d7e-8ccf-1a96826138cd', // Bank & Finance
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
  ];

  for (const r of receipts) {
    await prisma.claim.create({
      data: {
        firm_id: firmId,
        employee_id: r.employee_id,
        claim_date: r.claim_date,
        merchant: r.merchant,
        description: r.description,
        receipt_number: r.receipt_number,
        amount: r.amount,
        category_id: r.category_id,
        confidence: r.confidence,
        status: r.status,
        approval: 'approved',
        payment_status: 'unpaid',
        submitted_via: 'dashboard',
        type: 'receipt',
      },
    });
    console.log('Created:', r.receipt_number, '-', r.merchant, '- RM', r.amount);
  }

  console.log(`\nDone! Created ${receipts.length} unlinked receipts for Retail Mart Sdn Bhd`);
  await prisma.$disconnect();
}

seed().catch(console.error);
