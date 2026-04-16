import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const body = await request.json().catch(() => ({}));
  const { firmId, dryRun } = body as { firmId?: string; dryRun?: boolean };
  const isDryRun = dryRun !== false;

  // Build firm scope
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let firmScope: any;
  if (firmId) {
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
    }
    firmScope = { firm_id: firmId };
  } else if (firmIds) {
    firmScope = { firm_id: { in: firmIds } };
  } else {
    firmScope = {};
  }

  // Find ALL JVs with source references (including reversed ones — if source deleted, delete all)
  const allJVs = await prisma.journalEntry.findMany({
    where: {
      ...firmScope,
      source_id: { not: null },
    },
    select: { id: true, source_id: true, source_type: true, voucher_number: true, description: true, reversed_by_id: true, reversal_of_id: true },
  });

  if (allJVs.length === 0) {
    return NextResponse.json({ data: { orphans: [], reversed: 0, deleted: 0, message: 'No unreversed JVs found.' }, error: null });
  }

  const orphans: { id: string; voucher: string; description: string; reason: string; action: 'reverse' | 'delete' }[] = [];

  // Check each JV: does its source document still exist?
  for (const jv of allJVs) {
    const sid = jv.source_id!;
    let exists = false;
    let statusOk = false;

    try {
      if (jv.source_type === 'claim_approval') {
        const claim = await prisma.claim.findUnique({ where: { id: sid }, select: { approval: true } });
        exists = !!claim;
        statusOk = claim?.approval === 'approved';
      } else if (jv.source_type === 'invoice_posting') {
        const inv = await prisma.invoice.findUnique({ where: { id: sid }, select: { approval: true } });
        exists = !!inv;
        statusOk = inv?.approval === 'approved';
      } else if (jv.source_type === 'bank_recon') {
        const txn = await prisma.bankTransaction.findUnique({ where: { id: sid }, select: { recon_status: true } });
        exists = !!txn;
        statusOk = txn?.recon_status === 'manually_matched' || txn?.recon_status === 'matched';
      } else if (jv.source_type === 'sales_invoice_posting') {
        const inv = await prisma.salesInvoice.findUnique({ where: { id: sid }, select: { approval: true } });
        exists = !!inv;
        statusOk = inv?.approval === 'approved';
      } else {
        // Unknown source type — skip
        continue;
      }
    } catch {
      exists = false;
      statusOk = false;
    }

    if (!exists) {
      // Source document deleted — delete the JV (original or reversal, doesn't matter)
      orphans.push({
        id: jv.id,
        voucher: jv.voucher_number,
        description: jv.description ?? '',
        reason: 'Source document deleted',
        action: 'delete',
      });
    } else if (!statusOk && !jv.reversed_by_id && !jv.reversal_of_id) {
      // Source exists but status wrong, and JV not already reversed — reverse it
      orphans.push({
        id: jv.id,
        voucher: jv.voucher_number,
        description: jv.description ?? '',
        reason: 'Source document no longer approved/matched',
        action: 'reverse',
      });
    }
  }

  if (isDryRun) {
    return NextResponse.json({
      data: {
        orphans: orphans.map(o => ({ voucher: o.voucher, description: o.description, reason: o.reason, action: o.action })),
        reversed: 0,
        deleted: 0,
        message: `Found ${orphans.length} orphaned JVs out of ${allJVs.length} checked.`,
      },
      error: null,
    });
  }

  // Process orphans
  let reversed = 0;
  let deleted = 0;
  for (const orphan of orphans) {
    try {
      if (orphan.action === 'delete') {
        // Source doesn't exist — clear reversal refs then delete
        await prisma.journalEntry.updateMany({
          where: { reversed_by_id: orphan.id },
          data: { reversed_by_id: null },
        });
        await prisma.journalEntry.updateMany({
          where: { reversal_of_id: orphan.id },
          data: { reversal_of_id: null },
        });
        await prisma.journalEntry.delete({ where: { id: orphan.id } });
        deleted++;
      } else {
        // Source exists but status wrong — create a reversal JV
        const { reverseJournalEntry } = await import('@/lib/journal-entries');
        await reverseJournalEntry(orphan.id, session.user.id);
        reversed++;
      }
    } catch (e) {
      console.error(`Failed to process orphan ${orphan.voucher}:`, e);
    }
  }

  return NextResponse.json({
    data: {
      orphans: orphans.map(o => ({ voucher: o.voucher, description: o.description, reason: o.reason, action: o.action })),
      reversed,
      deleted,
      message: `Processed ${orphans.length} orphaned JVs: ${deleted} deleted, ${reversed} reversed.`,
    },
    error: null,
  });
}
