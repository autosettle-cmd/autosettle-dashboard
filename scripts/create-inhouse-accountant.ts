/**
 * Creates an in-house accountant assigned to a single firm.
 * Usage: npx tsx scripts/create-inhouse-accountant.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { createHash } from 'crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  // List all firms
  const firms = await prisma.firm.findMany({ select: { id: true, name: true } });
  console.log('Available firms:');
  firms.forEach(f => console.log(`  ${f.name} (${f.id})`));

  // Check existing bank statements
  const stmts = await prisma.bankStatement.findMany({
    select: { id: true, firm_id: true, bank_name: true, file_name: true, statement_date: true },
  });
  console.log('\nBank statements in DB:');
  stmts.forEach(s => {
    const firmName = firms.find(f => f.id === s.firm_id)?.name ?? 'unknown';
    console.log(`  ${s.file_name} | ${s.bank_name} | Firm: ${firmName} | ${s.statement_date.toISOString().split('T')[0]}`);
  });

  // Count bank transactions
  const txnCount = await prisma.bankTransaction.count();
  console.log(`\nTotal bank transactions: ${txnCount}`);

  // Create in-house accountant for "Retail Mart Sdn Bhd"
  const retailMart = firms.find(f => f.name.includes('Retail Mart'));
  if (!retailMart) { console.error('Retail Mart not found'); process.exit(1); }

  // Check if accountant already exists
  const existing = await prisma.user.findFirst({ where: { email: 'sarah@retailmart.com' } });
  if (existing) {
    console.log(`\nAccountant already exists: ${existing.name} (${existing.email})`);
    // Check assignments
    const assignments = await prisma.accountantFirm.findMany({ where: { user_id: existing.id } });
    console.log(`  Assigned to ${assignments.length} firm(s)`);
    await prisma.$disconnect();
    return;
  }

  // Look at how existing passwords are hashed
  const sampleUser = await prisma.user.findFirst({ select: { password_hash: true } });
  console.log(`\nSample password hash format: ${sampleUser?.password_hash?.substring(0, 20)}...`);

  // Create the accountant user
  // Use bcrypt-style hash if that's what existing users use, otherwise sha256
  const isBcrypt = sampleUser?.password_hash?.startsWith('$2');

  let passwordHash: string;
  if (isBcrypt) {
    // Need to use bcrypt - check if available
    try {
      const bcrypt = require('bcryptjs');
      passwordHash = await bcrypt.hash('password123', 10);
    } catch {
      try {
        const bcrypt = require('bcrypt');
        passwordHash = await bcrypt.hash('password123', 10);
      } catch {
        console.log('bcrypt not available, using sha256');
        passwordHash = hashPassword('password123');
      }
    }
  } else {
    passwordHash = hashPassword('password123');
  }

  const user = await prisma.user.create({
    data: {
      email: 'sarah@retailmart.com',
      password_hash: passwordHash,
      name: 'Sarah Lim',
      role: 'accountant',
      status: 'active',
    },
  });

  // Assign to Retail Mart only
  await prisma.accountantFirm.create({
    data: { user_id: user.id, firm_id: retailMart.id },
  });

  console.log(`\nCreated accountant:`);
  console.log(`  Name: Sarah Lim`);
  console.log(`  Email: sarah@retailmart.com`);
  console.log(`  Password: password123`);
  console.log(`  Firm: ${retailMart.name} (in-house — single firm assignment)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
