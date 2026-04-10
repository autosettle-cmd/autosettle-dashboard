import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { reverseJVsForSource } from '@/lib/journal-entries';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json().catch(() => ({}));
  const { firmId, dryRun } = body as { firmId?: string; dryRun?: boolean };
  const isDryRun = dryRun !== false;

  if (!firmId) {
    return NextResponse.json({ data: null, error: 'firmId required' }, { status: 400 });
  }
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  const claimJVs = await prisma.journalEntry.findMany({
    where: { firm_id: firmId, source_type: 'claim_approval', status: 'posted' },
    select: { id: true, source_id: true, voucher_number: true, description: true },
  });

  if (claimJVs.length === 0) {
    return NextResponse.json({ data: { orphans: [], reversed: 0, message: 'No claim JVs found' }, error: null });
  }

  const sourceIds = claimJVs.map(j => j.source_id).filter(Boolean) as string[];
  const claims = await prisma.claim.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, approval: true },
  });
  const claimMap = new Map(claims.map(c => [c.id, c]));

  const orphans: { voucher: string; description: string; reason: string }[] = [];
  const orphanSourceIds: string[] = [];

  for (const jv of claimJVs) {
    if (!jv.source_id) continue;
    const claim = claimMap.get(jv.source_id);
    if (!claim) {
      orphans.push({ voucher: jv.voucher_number, description: jv.description, reason: 'Claim deleted' });
      orphanSourceIds.push(jv.source_id);
    } else if (claim.approval !== 'approved') {
      orphans.push({ voucher: jv.voucher_number, description: jv.description, reason: `Claim: ${claim.approval}` });
      orphanSourceIds.push(jv.source_id);
    }
  }

  if (isDryRun) {
    return NextResponse.json({ data: { orphans, reversed: 0, message: `Found ${orphans.length} orphaned JVs.` }, error: null });
  }

  let reversed = 0;
  for (const sid of [...new Set(orphanSourceIds)]) {
    await reverseJVsForSource('claim_approval', sid, session.user.id);
    reversed++;
  }

  return NextResponse.json({ data: { orphans, reversed, message: `Reversed ${reversed} orphaned JVs.` }, error: null });
}
