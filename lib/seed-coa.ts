import { prisma } from "./prisma";
import { MALAYSIAN_COA_TEMPLATE, CATEGORY_GL_DEFAULTS } from "./coa-template";

/**
 * Seeds the default Malaysian Chart of Accounts + tax codes for a firm.
 * Idempotent — skips GL accounts if they exist, skips tax codes if they exist.
 * Can be called again to seed tax codes for firms that already have GL accounts.
 */
export async function seedCoAForFirm(firmId: string) {
  const codeToId: Record<string, string> = {};
  let accountsCreated = 0;
  let taxCodesCreated = 0;

  // ─── GL Accounts ────────────────────────────────────────────────────────
  const existingGl = await prisma.gLAccount.count({ where: { firm_id: firmId } });

  if (existingGl > 0) {
    // Already seeded — build lookup map for tax code GL linking
    const accounts = await prisma.gLAccount.findMany({
      where: { firm_id: firmId },
      select: { id: true, account_code: true },
    });
    for (const a of accounts) {
      codeToId[a.account_code] = a.id;
    }
  } else {
    // Pass 1: Create all accounts without parent references
    for (const entry of MALAYSIAN_COA_TEMPLATE) {
      const account = await prisma.gLAccount.create({
        data: {
          firm_id: firmId,
          account_code: entry.code,
          name: entry.name,
          account_type: entry.type,
          normal_balance: entry.balance,
          is_active: true,
          is_system: true,
          sort_order: MALAYSIAN_COA_TEMPLATE.indexOf(entry),
        },
      });
      codeToId[entry.code] = account.id;
      accountsCreated++;
    }

    // Pass 2: Set parent references
    for (const entry of MALAYSIAN_COA_TEMPLATE) {
      if (entry.parentCode && codeToId[entry.parentCode]) {
        await prisma.gLAccount.update({
          where: { id: codeToId[entry.code] },
          data: { parent_id: codeToId[entry.parentCode] },
        });
      }
    }

    // Pass 3: Auto-map categories to GL accounts via CategoryFirmOverride
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ firm_id: firmId }, { firm_id: null }],
        is_active: true,
      },
    });

    for (const category of categories) {
      const glCode = CATEGORY_GL_DEFAULTS[category.name];
      if (!glCode || !codeToId[glCode]) continue;

      await prisma.categoryFirmOverride.upsert({
        where: {
          category_id_firm_id: {
            category_id: category.id,
            firm_id: firmId,
          },
        },
        update: {
          gl_account_id: codeToId[glCode],
        },
        create: {
          category_id: category.id,
          firm_id: firmId,
          is_active: true,
          gl_account_id: codeToId[glCode],
        },
      });
    }
  }

  // ─── Tax Codes (runs regardless of GL account state) ──────────────────
  const existingTaxCodes = await prisma.taxCode.count({ where: { firm_id: firmId } });

  if (existingTaxCodes === 0) {
    const SST_DEFAULTS = [
      { code: "SR-6",  description: "Standard Rate SST 6%",  rate: 6.00,  tax_type: "SST",         inputGl: "115-000", outputGl: "213-000" },
      { code: "SR-10", description: "Service Tax 10%",       rate: 10.00, tax_type: "Service Tax",  inputGl: "115-000", outputGl: "213-000" },
      { code: "ZRL",   description: "Zero-Rated",            rate: 0.00,  tax_type: "Zero-rated",   inputGl: null,      outputGl: null },
      { code: "TX-E",  description: "Exempt",                rate: 0.00,  tax_type: "Exempt",       inputGl: null,      outputGl: null },
      { code: "OS",    description: "Out of Scope",          rate: 0.00,  tax_type: "Out of Scope", inputGl: null,      outputGl: null },
    ];

    for (const tc of SST_DEFAULTS) {
      const glId = tc.inputGl ? codeToId[tc.inputGl] ?? null : null;
      await prisma.taxCode.create({
        data: {
          firm_id: firmId,
          code: tc.code,
          description: tc.description,
          rate: tc.rate,
          tax_type: tc.tax_type,
          gl_account_id: glId,
        },
      });
      taxCodesCreated++;
    }
  }

  const seeded = accountsCreated > 0 || taxCodesCreated > 0;
  return {
    seeded,
    accountsCreated,
    taxCodesCreated,
    message: seeded
      ? `Seeded ${accountsCreated} GL accounts and ${taxCodesCreated} tax codes`
      : "Already fully seeded",
  };
}
