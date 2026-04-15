import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  const firmId = '442d767c-0b5f-4fee-8c27-c69a5fa33440'; // DS Plus Sdn Bhd
  const ahmadId = 'e3eeb229-80d7-48ef-afab-eadebf542706';
  const lisaId = '8d323742-d2ac-4655-bb0e-a663c19aab57';

  const claims = [
    // Ahmad Rashid: 3 claims totaling RM 285
    { employee_id: ahmadId, claim_date: new Date('2025-11-10'), merchant: 'Petronas Bangi', description: 'Fuel for client visit', receipt_number: 'PET-1110', amount: 85.00, category_id: 'ddcf8f57-1483-416f-b316-2dfaa8ab7bf9' }, // Automotive
    { employee_id: ahmadId, claim_date: new Date('2025-11-12'), merchant: 'Grab KL-PJ', description: 'Grab to client office', receipt_number: 'GRB-1112', amount: 45.00, category_id: '1c60f86c-4a05-47c9-a2a6-451d46e1fedc' }, // Travel & Transport
    { employee_id: ahmadId, claim_date: new Date('2025-11-14'), merchant: 'Nasi Lemak Antarabangsa', description: 'Client lunch meeting', receipt_number: 'NLA-1114', amount: 155.00, category_id: 'cf6d2a86-1a9d-4ea7-ab2b-3fd64d5161d2' }, // Meals & Entertainment
    // Lisa Tan: 2 claims totaling RM 178
    { employee_id: lisaId, claim_date: new Date('2025-11-11'), merchant: 'Popular Bookstore', description: 'Office supplies', receipt_number: 'POP-1111', amount: 68.00, category_id: '5cfc9d71-b35a-41c5-b5bb-c73e2b933361' }, // Office Expenses
    { employee_id: lisaId, claim_date: new Date('2025-11-13'), merchant: 'Shell Puchong', description: 'Fuel for delivery', receipt_number: 'SHL-1113', amount: 110.00, category_id: 'ddcf8f57-1483-416f-b316-2dfaa8ab7bf9' }, // Automotive
  ];

  for (const c of claims) {
    const created = await prisma.claim.create({
      data: {
        firm_id: firmId,
        employee_id: c.employee_id,
        claim_date: c.claim_date,
        merchant: c.merchant,
        description: c.description,
        receipt_number: c.receipt_number,
        amount: c.amount,
        category_id: c.category_id,
        confidence: 'HIGH',
        status: 'reviewed',
        approval: 'approved',
        payment_status: 'unpaid',
        amount_paid: 0,
        submitted_via: 'dashboard',
        type: 'claim',
      },
    });
    console.log(`Created: ${c.merchant} — RM ${c.amount} (${created.id})`);
  }

  console.log('\nTest claims created:');
  console.log('  Ahmad Rashid: 3 claims = RM 285 (Petronas RM85 + Grab RM45 + Nasi Lemak RM155)');
  console.log('  Lisa Tan: 2 claims = RM 178 (Popular RM68 + Shell RM110)');
  console.log('  Total: RM 463');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
