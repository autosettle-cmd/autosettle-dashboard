import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seed() {
  const firmId = 'fdf65e95-649b-437a-a8b3-1181e9d8ddbc'; // Tech Solutions
  const categoryOffice = '5cfc9d71-b35a-41c5-b5bb-c73e2b933361'; // Office Expenses
  const categoryRent = '55e6f1b2-4aa6-4e2b-9f33-881ef065a2d7'; // Rent & Facilities
  const categorySoftware = '7e1c4d43-17df-4d93-8f04-4c56c1ddc62f'; // Software & SaaS
  const categoryRepairs = '622692eb-1050-40b4-af9f-aca6250215d3'; // Repairs & Maintenance
  const categoryComm = '17bb321c-849d-446c-8dfd-2ca8e919ebca'; // Communication
  const categoryBank = '66172e19-8475-4d7e-8ccf-1a96826138cd'; // Bank & Finance

  const receipts = [
    // Receipts matching suppliers with unpaid invoices
    {
      employee_id: 'a77a50ba-a885-48af-99e0-369bd14dd57e', // Lee Wei Ming
      claim_date: new Date('2026-03-28'),
      merchant: 'Tenaga Nasional Berhad',
      description: 'Electricity bill payment - March 2026',
      receipt_number: 'TNB-RCP-032026',
      amount: 3500,
      category_id: categoryRent,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      claim_date: new Date('2026-03-25'),
      merchant: 'Tenaga Nasional Berhad',
      description: 'Electricity deposit payment',
      receipt_number: 'TNB-RCP-DEP-001',
      amount: 1200,
      category_id: categoryRent,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '3595f30c-9b94-4c25-965d-d2f133fef6df', // Siti Rahimah
      claim_date: new Date('2026-03-22'),
      merchant: 'CloudTech Solutions',
      description: 'Cloud hosting payment - Q2 advance',
      receipt_number: 'CTS-RCP-Q2-2026',
      amount: 5000,
      category_id: categorySoftware,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'ad7ea880-0c43-4296-9b8a-2e690f910b30', // Raj Kumar
      claim_date: new Date('2026-03-20'),
      merchant: 'CloudTech Solutions',
      description: 'Software license renewal',
      receipt_number: 'CTS-RCP-LIC-2026',
      amount: 1770,
      category_id: categorySoftware,
      confidence: 'MEDIUM' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      claim_date: new Date('2026-03-18'),
      merchant: 'COEX ARCHITECTS SDN BHD',
      description: 'Architectural consultation payment',
      receipt_number: 'COEX-RCP-2026-001',
      amount: 15000,
      category_id: categoryRepairs,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '3595f30c-9b94-4c25-965d-d2f133fef6df',
      claim_date: new Date('2026-03-15'),
      merchant: 'COEX ARCHITECTS SDN BHD',
      description: 'Site survey fee payment',
      receipt_number: 'COEX-RCP-2026-002',
      amount: 8500,
      category_id: categoryRepairs,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'ad7ea880-0c43-4296-9b8a-2e690f910b30',
      claim_date: new Date('2026-03-12'),
      merchant: 'Syarikat Bekalan Pejabat',
      description: 'Office supplies bulk purchase',
      receipt_number: 'SBP-RCP-2026-015',
      amount: 1063.50,
      category_id: categoryOffice,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'a77a50ba-a885-48af-99e0-369bd14dd57e',
      claim_date: new Date('2026-03-10'),
      merchant: 'KL Office Rentals',
      description: 'Office rent payment - April 2026',
      receipt_number: 'KLOR-RCP-APR-2026',
      amount: 9010,
      category_id: categoryRent,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'e6fc1e58-9179-4b46-aa75-6474b912d6c4', // lau hsin huat
      claim_date: new Date('2026-03-29'),
      merchant: 'Alam Flora Sdn Bhd',
      description: 'Waste management - March',
      receipt_number: 'AF-RCP-MAR-2026',
      amount: 2800,
      category_id: categoryRepairs,
      confidence: 'MEDIUM' as const,
      status: 'pending_review' as const,
    },
    {
      employee_id: 'e6fc1e58-9179-4b46-aa75-6474b912d6c4',
      claim_date: new Date('2026-03-27'),
      merchant: 'Rapid KL Maintenance',
      description: 'Building maintenance service',
      receipt_number: 'RKM-RCP-2026-003',
      amount: 4500,
      category_id: categoryRepairs,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: '3595f30c-9b94-4c25-965d-d2f133fef6df',
      claim_date: new Date('2026-03-30'),
      merchant: 'Maybank',
      description: 'Bank transfer fee - bulk payment',
      receipt_number: 'MB-RCP-2026-088',
      amount: 150,
      category_id: categoryBank,
      confidence: 'HIGH' as const,
      status: 'reviewed' as const,
    },
    {
      employee_id: 'ad7ea880-0c43-4296-9b8a-2e690f910b30',
      claim_date: new Date('2026-03-26'),
      merchant: 'Maxis Business',
      description: 'Internet and phone bill - March',
      receipt_number: 'MXS-RCP-MAR-2026',
      amount: 890,
      category_id: categoryComm,
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
    console.log('Created receipt:', r.receipt_number, '-', r.merchant, '- RM', r.amount);
  }

  console.log(`\nDone! Created ${receipts.length} unlinked receipts for Tech Solutions Sdn Bhd`);
  await prisma.$disconnect();
}

seed().catch(console.error);
