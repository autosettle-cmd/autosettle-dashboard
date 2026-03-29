import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Clear existing data in dependency order
  await prisma.claim.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.user.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.category.deleteMany();
  await prisma.firm.deleteMany();

  // Accountant user
  await prisma.user.create({
    data: {
      email: 'accountant@autosettle.my',
      password_hash: await hash('password123', 10),
      name: 'Ahmad Rashid',
      role: 'accountant',
    },
  });

  // Firms
  const firm1 = await prisma.firm.create({
    data: {
      name: 'Tech Solutions Sdn Bhd',
      registration_number: '202301012345',
      contact_email: 'admin@techsolutions.my',
      plan: 'paid',
    },
  });

  const firm2 = await prisma.firm.create({
    data: {
      name: 'Retail Mart Sdn Bhd',
      registration_number: '202301067890',
      contact_email: 'admin@retailmart.my',
      plan: 'free',
    },
  });

  // Categories (5 per firm)
  const catNames = ['Petrol', 'Medical', 'Parking', 'Meals', 'Others'];
  const [cats1, cats2] = await Promise.all([
    Promise.all(catNames.map((name) => prisma.category.create({ data: { firm_id: firm1.id, name } }))),
    Promise.all(catNames.map((name) => prisma.category.create({ data: { firm_id: firm2.id, name } }))),
  ]);

  // Employees (2 in firm1, 1 in firm2)
  const [emp1, emp2, emp3] = await Promise.all([
    prisma.employee.create({ data: { name: 'Siti Rahimah', phone: '60123456001', email: 'siti@techsolutions.my', firm_id: firm1.id } }),
    prisma.employee.create({ data: { name: 'Raj Kumar', phone: '60123456002', email: 'raj@techsolutions.my', firm_id: firm1.id } }),
    prisma.employee.create({ data: { name: 'Mei Ling', phone: '60123456003', email: 'meiling@retailmart.my', firm_id: firm2.id } }),
  ]);

  const daysAgo = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // 10 sample claims
  await prisma.claim.createMany({
    data: [
      {
        firm_id: firm1.id, employee_id: emp1.id, category_id: cats1[0].id,
        claim_date: daysAgo(2), merchant: 'Petronas KLCC', amount: '120.00',
        confidence: 'HIGH', status: 'reviewed', approval: 'approved',
        payment_status: 'paid', submitted_via: 'dashboard', receipt_number: 'PET-2024-001',
      },
      {
        firm_id: firm1.id, employee_id: emp1.id, category_id: cats1[3].id,
        claim_date: daysAgo(5), merchant: 'Nasi Kandar Pelita', amount: '45.50',
        confidence: 'HIGH', status: 'reviewed', approval: 'pending_approval',
        payment_status: 'unpaid', submitted_via: 'whatsapp',
        description: 'Team lunch after client meeting',
      },
      {
        firm_id: firm1.id, employee_id: emp1.id, category_id: cats1[2].id,
        claim_date: daysAgo(8), merchant: 'KLCC Parking Sdn Bhd', amount: '12.00',
        confidence: 'MEDIUM', status: 'pending_review', approval: 'pending_approval',
        payment_status: 'unpaid', submitted_via: 'whatsapp',
      },
      {
        firm_id: firm1.id, employee_id: emp2.id, category_id: cats1[1].id,
        claim_date: daysAgo(3), merchant: 'Pantai Hospital KL', amount: '350.00',
        confidence: 'HIGH', status: 'reviewed', approval: 'approved',
        payment_status: 'unpaid', submitted_via: 'dashboard',
        description: 'Outpatient consultation and medication',
      },
      {
        firm_id: firm1.id, employee_id: emp2.id, category_id: cats1[0].id,
        claim_date: daysAgo(10), merchant: 'Shell Bangsar', amount: '80.00',
        confidence: 'HIGH', status: 'reviewed', approval: 'not_approved',
        payment_status: 'unpaid', submitted_via: 'whatsapp',
        rejection_reason: 'Duplicate claim — already reimbursed in previous submission.',
      },
      {
        firm_id: firm1.id, employee_id: emp2.id, category_id: cats1[4].id,
        claim_date: daysAgo(15), merchant: 'Courts Mammoth Midvalley', amount: '899.00',
        confidence: 'LOW', status: 'pending_review', approval: 'pending_approval',
        payment_status: 'unpaid', submitted_via: 'whatsapp',
        description: 'Office supplies — keyboard and mouse',
      },
      {
        firm_id: firm1.id, employee_id: emp2.id, category_id: cats1[3].id,
        claim_date: daysAgo(1), merchant: 'Restaurant Rebung', amount: '67.80',
        confidence: 'HIGH', status: 'reviewed', approval: 'pending_approval',
        payment_status: 'unpaid', submitted_via: 'dashboard',
        description: 'Client entertainment lunch',
      },
      {
        firm_id: firm2.id, employee_id: emp3.id, category_id: cats2[0].id,
        claim_date: daysAgo(4), merchant: 'BHP Petrol Cheras', amount: '95.00',
        confidence: 'HIGH', status: 'reviewed', approval: 'approved',
        payment_status: 'paid', submitted_via: 'whatsapp',
      },
      {
        firm_id: firm2.id, employee_id: emp3.id, category_id: cats2[3].id,
        claim_date: daysAgo(7), merchant: "McDonald's Midvalley", amount: '28.50',
        confidence: 'HIGH', status: 'pending_review', approval: 'pending_approval',
        payment_status: 'unpaid', submitted_via: 'whatsapp',
      },
      {
        firm_id: firm2.id, employee_id: emp3.id, category_id: cats2[2].id,
        claim_date: daysAgo(12), merchant: 'Midvalley Parking', amount: '16.00',
        confidence: 'MEDIUM', status: 'reviewed', approval: 'approved',
        payment_status: 'unpaid', submitted_via: 'dashboard',
      },
    ],
  });

  console.log('Seed complete:');
  console.log(`  Firms: ${firm1.name}, ${firm2.name}`);
  console.log(`  Employees: ${emp1.name}, ${emp2.name}, ${emp3.name}`);
  console.log('  Claims: 10 with varied statuses');
  console.log('  Categories: 5 per firm (Petrol, Medical, Parking, Meals, Others)');
  console.log('\n  Accountant login: accountant@autosettle.my / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
