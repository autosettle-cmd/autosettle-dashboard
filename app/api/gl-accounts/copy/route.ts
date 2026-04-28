import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sourceFirmId, targetFirmId } = body as { sourceFirmId: string; targetFirmId: string };

    if (!sourceFirmId || !targetFirmId) {
      return NextResponse.json({ data: null, error: 'sourceFirmId and targetFirmId are required' }, { status: 400 });
    }

    if (sourceFirmId === targetFirmId) {
      return NextResponse.json({ data: null, error: 'Source and target firms must be different' }, { status: 400 });
    }

    // Auth: accountant must have access to both firms
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds) {
      if (!firmIds.includes(sourceFirmId) || !firmIds.includes(targetFirmId)) {
        return NextResponse.json({ data: null, error: 'Not authorized for one or both firms' }, { status: 403 });
      }
    }

    // Block if target firm already has GL accounts
    const existingCount = await prisma.gLAccount.count({ where: { firm_id: targetFirmId } });
    if (existingCount > 0) {
      return NextResponse.json({ data: null, error: `Target firm already has ${existingCount} GL accounts. Delete them first or use a template.` }, { status: 400 });
    }

    // Fetch source data
    const [sourceAccounts, sourceTaxCodes, sourceOverrides] = await Promise.all([
      prisma.gLAccount.findMany({
        where: { firm_id: sourceFirmId },
        orderBy: { sort_order: 'asc' },
      }),
      prisma.taxCode.findMany({ where: { firm_id: sourceFirmId } }),
      prisma.categoryFirmOverride.findMany({
        where: { firm_id: sourceFirmId },
        include: { category: { select: { id: true } } },
      }),
    ]);

    if (sourceAccounts.length === 0) {
      return NextResponse.json({ data: null, error: 'Source firm has no GL accounts to copy' }, { status: 400 });
    }

    // Build code→sourceId and sourceId→code maps
    const sourceIdToCode: Record<string, string> = {};
    for (const a of sourceAccounts) {
      sourceIdToCode[a.id] = a.account_code;
    }

    // Pass 1: Create all GL accounts without parents
    const codeToNewId: Record<string, string> = {};
    let glAccountsCopied = 0;

    for (let i = 0; i < sourceAccounts.length; i++) {
      const src = sourceAccounts[i];
      const account = await prisma.gLAccount.create({
        data: {
          firm_id: targetFirmId,
          account_code: src.account_code,
          name: src.name,
          account_type: src.account_type,
          normal_balance: src.normal_balance,
          is_active: src.is_active,
          is_system: false,
          sort_order: i,
          description: src.description,
        },
      });
      codeToNewId[src.account_code] = account.id;
      glAccountsCopied++;
    }

    // Pass 2: Link parents by code
    for (const src of sourceAccounts) {
      if (src.parent_id) {
        const parentCode = sourceIdToCode[src.parent_id];
        if (parentCode && codeToNewId[parentCode]) {
          await prisma.gLAccount.update({
            where: { id: codeToNewId[src.account_code] },
            data: { parent_id: codeToNewId[parentCode] },
          });
        }
      }
    }

    // Copy CategoryFirmOverrides with remapped GL IDs
    let categoriesMapped = 0;
    for (const ov of sourceOverrides) {
      let newGlId: string | null = null;
      if (ov.gl_account_id) {
        const code = sourceIdToCode[ov.gl_account_id];
        newGlId = code ? codeToNewId[code] ?? null : null;
      }

      await prisma.categoryFirmOverride.upsert({
        where: { category_id_firm_id: { category_id: ov.category_id, firm_id: targetFirmId } },
        update: { gl_account_id: newGlId, is_active: ov.is_active },
        create: {
          category_id: ov.category_id,
          firm_id: targetFirmId,
          gl_account_id: newGlId,
          is_active: ov.is_active,
        },
      });
      categoriesMapped++;
    }

    // Copy TaxCodes with remapped GL IDs
    let taxCodesCopied = 0;
    for (const tc of sourceTaxCodes) {
      let newGlId: string | null = null;
      if (tc.gl_account_id) {
        const code = sourceIdToCode[tc.gl_account_id];
        newGlId = code ? codeToNewId[code] ?? null : null;
      }

      await prisma.taxCode.create({
        data: {
          firm_id: targetFirmId,
          code: tc.code,
          description: tc.description,
          rate: tc.rate,
          tax_type: tc.tax_type,
          gl_account_id: newGlId,
          is_active: tc.is_active,
        },
      });
      taxCodesCopied++;
    }

    // Set firm GL defaults by matching codes from source firm
    const sourceFirm = await prisma.firm.findUnique({
      where: { id: sourceFirmId },
      select: {
        default_trade_payables_gl_id: true,
        default_staff_claims_gl_id: true,
        default_trade_receivables_gl_id: true,
        default_retained_earnings_gl_id: true,
      },
    });

    const defaults: Record<string, string> = {};
    if (sourceFirm) {
      const map = [
        ['default_trade_payables_gl_id', sourceFirm.default_trade_payables_gl_id],
        ['default_staff_claims_gl_id', sourceFirm.default_staff_claims_gl_id],
        ['default_trade_receivables_gl_id', sourceFirm.default_trade_receivables_gl_id],
        ['default_retained_earnings_gl_id', sourceFirm.default_retained_earnings_gl_id],
      ] as const;

      for (const [field, sourceGlId] of map) {
        if (sourceGlId) {
          const code = sourceIdToCode[sourceGlId];
          const newId = code ? codeToNewId[code] : null;
          if (newId) defaults[field] = newId;
        }
      }
    }

    if (Object.keys(defaults).length > 0) {
      await prisma.firm.update({ where: { id: targetFirmId }, data: defaults });
    }

    return NextResponse.json({
      data: {
        glAccountsCopied,
        categoriesMapped,
        taxCodesCopied,
        defaultsSet: Object.keys(defaults),
        message: `Copied ${glAccountsCopied} GL accounts, ${categoriesMapped} category mappings, ${taxCodesCopied} tax codes.`,
      },
      error: null,
    }, { status: 201 });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
