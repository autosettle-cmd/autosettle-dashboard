import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { createJournalEntry, reverseJVsForSource } from '@/lib/journal-entries';

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

  // Fetch claims with GL + amount data for JV creation
  const oldClaims = await prisma.claim.findMany({
    where: { id: { in: claimIds }, ...scope },
    select: {
      id: true, firm_id: true, approval: true, rejection_reason: true,
      amount: true, claim_date: true, gl_account_id: true, merchant: true,
      category: { select: { name: true } },
    },
  });
  const oldClaimMap = new Map(oldClaims.map((c) => [c.id, c]));

  await Promise.all(
    chunks.map((chunk) =>
      prisma.claim.updateMany({
        where: { id: { in: chunk }, ...scope },
        data: updateData,
      })
    )
  );

  // ─── Auto-JV on approve / reverse on revert ────────────────────────────
  const jvErrors: string[] = [];

  if (action === 'approve') {
    // Load firm GL defaults (grouped by firm to avoid repeated queries)
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
      // Resolve the GL account: request-level override > claim's existing GL
      const expenseGlId = gl_account_id || claim.gl_account_id;
      const contraGlId = firmDefaults.get(claim.firm_id);

      if (!expenseGlId || !contraGlId) {
        jvErrors.push(`Claim ${claim.id}: missing GL account (expense: ${!!expenseGlId}, contra: ${!!contraGlId})`);
        continue;
      }

      try {
        await createJournalEntry({
          firmId: claim.firm_id,
          postingDate: claim.claim_date,
          description: `${claim.category.name} — ${claim.merchant}`,
          sourceType: 'claim_approval',
          sourceId: claim.id,
          lines: [
            { glAccountId: expenseGlId, debitAmount: Number(claim.amount), creditAmount: 0, description: claim.merchant },
            { glAccountId: contraGlId, debitAmount: 0, creditAmount: Number(claim.amount), description: 'Staff Claims Payable' },
          ],
          createdBy: session.user.id,
        });
      } catch (err) {
        jvErrors.push(`Claim ${claim.id}: ${err instanceof Error ? err.message : 'JV creation failed'}`);
      }
    }
  }

  if (action === 'revert') {
    for (const claim of oldClaims) {
      if (claim.approval !== 'approved') continue; // only reverse if was approved
      try {
        await reverseJVsForSource('claim_approval', claim.id, session.user.id);
      } catch (err) {
        jvErrors.push(`Claim ${claim.id}: ${err instanceof Error ? err.message : 'JV reversal failed'}`);
      }
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

  return NextResponse.json({
    data: { updated: claimIds.length, ...(jvErrors.length > 0 && { jv_warnings: jvErrors }) },
    error: null,
  });
}
