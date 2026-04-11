import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reverseJVsForSource } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/journal-entries/cleanup-orphans
 * Finds and reverses JVs whose source claims are no longer approved.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun !== false; // default to dry run

  // Find all posted claim_approval JVs for this firm
  const claimJVs = await prisma.journalEntry.findMany({
    where: { firm_id: firmId, source_type: 'claim_approval', status: 'posted' },
    select: { id: true, source_id: true, voucher_number: true, description: true },
  });

  if (claimJVs.length === 0) {
    return NextResponse.json({ data: { orphans: [], message: 'No claim JVs found' }, error: null });
  }

  // Check which source claims are NOT approved
  const sourceIds = claimJVs.map(j => j.source_id).filter(Boolean) as string[];
  const claims = await prisma.claim.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, approval: true, merchant: true },
  });
  const claimMap = new Map(claims.map(c => [c.id, c]));

  const orphans: { jv_id: string; voucher: string; description: string; reason: string }[] = [];

  for (const jv of claimJVs) {
    if (!jv.source_id) continue;
    const claim = claimMap.get(jv.source_id);
    if (!claim) {
      orphans.push({ jv_id: jv.id, voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Claim deleted' });
    } else if (claim.approval !== 'approved') {
      orphans.push({ jv_id: jv.id, voucher: jv.voucher_number, description: jv.description ?? '', reason: `Claim status: ${claim.approval}` });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      data: { orphans, message: `Found ${orphans.length} orphaned JVs. Send { dryRun: false } to reverse them.` },
      error: null,
    });
  }

  // Reverse orphaned JVs
  let reversed = 0;
  for (const orphan of orphans) {
    const jv = claimJVs.find(j => j.id === orphan.jv_id);
    if (jv?.source_id) {
      await reverseJVsForSource('claim_approval', jv.source_id, session.user.id);
      reversed++;
    }
  }

  return NextResponse.json({
    data: { orphans, reversed, message: `Reversed ${reversed} orphaned JVs.` },
    error: null,
  });
}
