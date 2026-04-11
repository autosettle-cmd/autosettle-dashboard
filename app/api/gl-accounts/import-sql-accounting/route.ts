import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { SQL_ACCOUNTING_COA, SYSTEM_ACCOUNTS } from '@/lib/dsplus-coa';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const accountantFirmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json();
  const { confirm, firmId } = body as { confirm: string; firmId: string };

  if (confirm !== 'REPLACE_COA' || !firmId) {
    return NextResponse.json({ data: null, error: 'Send { confirm: "REPLACE_COA", firmId: "..." }' }, { status: 400 });
  }

  if (accountantFirmIds && !accountantFirmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
  }

  const jeCount = await prisma.journalEntry.count({ where: { firm_id: firmId } });
  if (jeCount > 0) {
    return NextResponse.json({ data: null, error: `Cannot replace COA: ${jeCount} journal entries exist. Delete JVs first or use merge mode.` }, { status: 400 });
  }

  await prisma.gLAccount.deleteMany({ where: { firm_id: firmId } });

  await prisma.firm.update({
    where: { id: firmId },
    data: {
      default_trade_payables_gl_id: null,
      default_staff_claims_gl_id: null,
      default_trade_receivables_gl_id: null,
      default_retained_earnings_gl_id: null,
    },
  });

  const allAccounts = [...SQL_ACCOUNTING_COA, ...SYSTEM_ACCOUNTS];
  const codeToId: Record<string, string> = {};
  let created = 0;

  for (let i = 0; i < allAccounts.length; i++) {
    const entry = allAccounts[i];
    const account = await prisma.gLAccount.create({
      data: {
        firm_id: firmId,
        account_code: entry.code,
        name: entry.name,
        account_type: entry.type,
        normal_balance: entry.balance,
        is_active: true,
        is_system: false,
        sort_order: i,
      },
    });
    codeToId[entry.code] = account.id;
    created++;
  }

  for (const entry of allAccounts) {
    if (entry.parentCode && codeToId[entry.parentCode]) {
      await prisma.gLAccount.update({
        where: { id: codeToId[entry.code] },
        data: { parent_id: codeToId[entry.parentCode] },
      });
    }
  }

  const updates: Record<string, string> = {};
  if (codeToId["400-000"]) updates.default_trade_payables_gl_id = codeToId["400-000"];
  if (codeToId["405-001"]) updates.default_staff_claims_gl_id = codeToId["405-001"];
  if (codeToId["300-000"]) updates.default_trade_receivables_gl_id = codeToId["300-000"];
  if (codeToId["150-000"]) updates.default_retained_earnings_gl_id = codeToId["150-000"];

  if (Object.keys(updates).length > 0) {
    await prisma.firm.update({ where: { id: firmId }, data: updates });
  }

  // Update category → GL account mappings for SQL Accounting codes
  const CATEGORY_GL_MAP: Record<string, string> = {
    "Advertising & Marketing":    "901-001",  // ADVERTISEMENT
    "Automotive":                 "906-000",  // UPKEEP OF MOTOR VEHICLE
    "Bank & Finance":             "902-000",  // BANK CHARGES
    "Communication":              "910-000",  // TELEPHONE & FAX CHARGES
    "Equipment & Hardware":       "903-000",  // CONSUMABLE
    "Insurance":                  "919-004",  // SUNDRY EXPENSES
    "Meals & Entertainment":      "905-001",  // ENTERTAINMENT
    "Merchandise & Inventory":    "610-000",  // PURCHASE
    "Office Expenses":            "921-001",  // UPKEEP OF OFFICE
    "Professional Services":      "901-002",  // ACCOUNTING FEE
    "Rent & Facilities":          "915-000",  // OFFICE & WAREHOUSE RENTAL
    "Repairs & Maintenance":      "921-001",  // UPKEEP OF OFFICE
    "Software & SaaS":            "919-003",  // SUBSCRIPTION FEE
    "Staff Welfare":              "913-000",  // MEDICAL EXPENSES
    "Taxes & Licenses":           "920-003",  // TAX FEE
    "Training & Education":       "917-000",  // TRAVEL & ACCOMMODATION
    "Travel & Transport":         "917-000",  // TRAVEL & ACCOMMODATION
    "Utilities":                  "907-000",  // WATER & ELECTRICITY
    "Miscellaneous":              "919-004",  // SUNDRY EXPENSES
  };

  let categoriesMapped = 0;
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  for (const cat of categories) {
    const glCode = CATEGORY_GL_MAP[cat.name];
    if (glCode && codeToId[glCode]) {
      await prisma.categoryFirmOverride.upsert({
        where: { category_id_firm_id: { category_id: cat.id, firm_id: firmId } },
        update: { gl_account_id: codeToId[glCode] },
        create: { category_id: cat.id, firm_id: firmId, gl_account_id: codeToId[glCode] },
      });
      categoriesMapped++;
    }
  }

  return NextResponse.json({
    data: {
      created,
      categories_mapped: categoriesMapped,
      defaults_set: Object.keys(updates),
      message: `Imported ${created} GL accounts. GL defaults set. ${categoriesMapped} categories mapped to GL accounts.`,
    },
    error: null,
  });
}
