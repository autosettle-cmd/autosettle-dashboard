import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';

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

  // Fetch old values for audit before updating
  const oldClaims = await prisma.claim.findMany({
    where: { id: { in: claimIds }, ...scope },
    select: { id: true, firm_id: true, approval: true, rejection_reason: true },
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
