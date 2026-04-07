import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { createJournalEntry, reverseJVsForSource, findOpenPeriod } from '@/lib/journal-entries';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { claimIds, action, reason, gl_account_id } = body as {
    claimIds: string[];
    action: 'approve' | 'reject' | 'revert';
    reason?: string;
    gl_account_id?: string;
  };

  if (!Array.isArray(claimIds) || claimIds.length === 0) {
    return NextResponse.json({ data: null, error: 'claimIds required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject' && action !== 'revert') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const scope = firmScope(firmIds);

  // Fetch claims with GL + amount data
  const oldClaims = await prisma.claim.findMany({
    where: { id: { in: claimIds }, ...scope },
    select: {
      id: true, firm_id: true, approval: true, rejection_reason: true,
      amount: true, claim_date: true, gl_account_id: true, merchant: true,
      category: { select: { name: true } },
    },
  });
  const oldClaimMap = new Map(oldClaims.map((c) => [c.id, c]));

  // ─── Pre-validation for approve: block if JV cannot be created ─────────
  if (action === 'approve') {
    const errors: string[] = [];

    // Check firm GL defaults
    const firmDefaultsMap = new Map<string, string | null>();
    for (const claim of oldClaims) {
      if (!firmDefaultsMap.has(claim.firm_id)) {
        const firm = await prisma.firm.findUnique({
          where: { id: claim.firm_id },
          select: { default_staff_claims_gl_id: true, name: true },
        });
        firmDefaultsMap.set(claim.firm_id, firm?.default_staff_claims_gl_id ?? null);
        if (!firm?.default_staff_claims_gl_id) {
          errors.push(`Firm "${firm?.name}" has no Staff Claims Payable GL account configured. Go to Chart of Accounts → GL Defaults to set it up.`);
        }
      }
    }

    // Check each claim
    for (const claim of oldClaims) {
      const expenseGlId = gl_account_id || claim.gl_account_id;
      if (!expenseGlId) {
        errors.push(`Claim by ${claim.merchant} (${claim.category.name}) has no GL account assigned. Assign a GL account before approving.`);
      }
    }

    // Check fiscal periods
    const checkedPeriods = new Set<string>();
    for (const claim of oldClaims) {
      const periodKey = `${claim.firm_id}|${claim.claim_date.toISOString().split('T')[0]}`;
      if (checkedPeriods.has(periodKey)) continue;
      checkedPeriods.add(periodKey);
      try {
        await findOpenPeriod(prisma, claim.firm_id, claim.claim_date);
      } catch {
        const dateStr = claim.claim_date.toISOString().split('T')[0];
        errors.push(`No open fiscal period for date ${dateStr}. Go to Fiscal Periods to create or open a period covering this date.`);
      }
    }

    if (errors.length > 0) {
      // Deduplicate
      const unique = Array.from(new Set(errors));
      return NextResponse.json({ data: null, error: unique.join('\n') }, { status: 400 });
    }
  }

  // ─── Proceed with update ───────────────────────────────────────────────
  const updateData =
    action === 'approve'
      ? { approval: 'approved' as const, rejection_reason: null as string | null, ...(gl_account_id && { gl_account_id }) }
      : action === 'revert'
      ? { approval: 'pending_approval' as const, rejection_reason: null as string | null }
      : { approval: 'not_approved' as const, rejection_reason: (reason ?? null) as string | null };

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < claimIds.length; i += CHUNK) {
    chunks.push(claimIds.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map((chunk) =>
      prisma.claim.updateMany({
        where: { id: { in: chunk }, ...scope },
        data: updateData,
      })
    )
  );

  // ─── Create / reverse JVs ─────────────────────────────────────────────
  if (action === 'approve') {
    const firmDefaults = new Map<string, string | null>();
    for (const claim of oldClaims) {
      if (!firmDefaults.has(claim.firm_id)) {
        const firm = await prisma.firm.findUnique({
          where: { id: claim.firm_id },
          select: { default_staff_claims_gl_id: true },
        });
        firmDefaults.set(claim.firm_id, firm?.default_staff_claims_gl_id ?? null);
      }
    }

    for (const claim of oldClaims) {
      const expenseGlId = gl_account_id || claim.gl_account_id;
      const contraGlId = firmDefaults.get(claim.firm_id);
      // Already validated above — safe to create
      await createJournalEntry({
        firmId: claim.firm_id,
        postingDate: claim.claim_date,
        description: `${claim.category.name} — ${claim.merchant}`,
        sourceType: 'claim_approval',
        sourceId: claim.id,
        lines: [
          { glAccountId: expenseGlId!, debitAmount: Number(claim.amount), creditAmount: 0, description: claim.merchant },
          { glAccountId: contraGlId!, debitAmount: 0, creditAmount: Number(claim.amount), description: 'Staff Claims Payable' },
        ],
        createdBy: session.user.id,
      });
    }
  }

  if (action === 'revert') {
    for (const claim of oldClaims) {
      if (claim.approval !== 'approved') continue;
      await reverseJVsForSource('claim_approval', claim.id, session.user.id);
    }
  }

  // Audit log per claim
  for (const claim of oldClaims) {
    await auditLog({
      firmId: claim.firm_id,
      tableName: 'Claim',
      recordId: claim.id,
      action: 'update',
      oldValues: { approval: oldClaimMap.get(claim.id)?.approval, rejection_reason: oldClaimMap.get(claim.id)?.rejection_reason },
      newValues: { approval: updateData.approval, rejection_reason: updateData.rejection_reason },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { updated: claimIds.length }, error: null });
}
