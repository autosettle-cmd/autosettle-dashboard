import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { reverseJVsForSource } from '@/lib/journal-entries';

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

  // Build firm scope — support "All Firms" (no firmId)
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
    // Super admin — all firms
    firmScope = {};
  }

  // Find ALL posted JVs with source references
  const allJVs = await prisma.journalEntry.findMany({
    where: { ...firmScope, status: 'posted', source_id: { not: null } },
    select: { id: true, source_id: true, source_type: true, voucher_number: true, description: true },
  });

  if (allJVs.length === 0) {
    return NextResponse.json({ data: { orphans: [], reversed: 0, message: 'No JVs found' }, error: null });
  }

  // Group by source type for batch checking
  const byType: Record<string, typeof allJVs> = {};
  for (const jv of allJVs) {
    const key = jv.source_type;
    if (!byType[key]) byType[key] = [];
    byType[key].push(jv);
  }

  const orphans: { voucher: string; description: string; reason: string; source_type: string }[] = [];
  const orphanEntries: { sourceType: string; sourceId: string }[] = [];

  // Check claim_approval JVs
  if (byType['claim_approval']) {
    const sourceIds = byType['claim_approval'].map(j => j.source_id!);
    const claims = await prisma.claim.findMany({ where: { id: { in: sourceIds } }, select: { id: true, approval: true } });
    const claimMap = new Map(claims.map(c => [c.id, c]));
    for (const jv of byType['claim_approval']) {
      const claim = claimMap.get(jv.source_id!);
      if (!claim) {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Claim deleted', source_type: 'claim_approval' });
        orphanEntries.push({ sourceType: 'claim_approval', sourceId: jv.source_id! });
      } else if (claim.approval !== 'approved') {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: `Claim status: ${claim.approval}`, source_type: 'claim_approval' });
        orphanEntries.push({ sourceType: 'claim_approval', sourceId: jv.source_id! });
      }
    }
  }

  // Check invoice_posting JVs
  if (byType['invoice_posting']) {
    const sourceIds = byType['invoice_posting'].map(j => j.source_id!);
    const invoices = await prisma.invoice.findMany({ where: { id: { in: sourceIds } }, select: { id: true, approval: true } });
    const invMap = new Map(invoices.map(i => [i.id, i]));
    for (const jv of byType['invoice_posting']) {
      const inv = invMap.get(jv.source_id!);
      if (!inv) {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Invoice deleted', source_type: 'invoice_posting' });
        orphanEntries.push({ sourceType: 'invoice_posting', sourceId: jv.source_id! });
      } else if (inv.approval !== 'approved') {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: `Invoice status: ${inv.approval}`, source_type: 'invoice_posting' });
        orphanEntries.push({ sourceType: 'invoice_posting', sourceId: jv.source_id! });
      }
    }
  }

  // Check bank_recon JVs
  if (byType['bank_recon']) {
    const sourceIds = byType['bank_recon'].map(j => j.source_id!);
    const txns = await prisma.bankTransaction.findMany({ where: { id: { in: sourceIds } }, select: { id: true, recon_status: true } });
    const txnMap = new Map(txns.map(t => [t.id, t]));
    for (const jv of byType['bank_recon']) {
      const txn = txnMap.get(jv.source_id!);
      if (!txn) {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Bank transaction deleted', source_type: 'bank_recon' });
        orphanEntries.push({ sourceType: 'bank_recon', sourceId: jv.source_id! });
      } else if (txn.recon_status === 'unmatched') {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Bank txn unmatched', source_type: 'bank_recon' });
        orphanEntries.push({ sourceType: 'bank_recon', sourceId: jv.source_id! });
      }
    }
  }

  // Check sales_invoice_posting JVs
  if (byType['sales_invoice_posting']) {
    const sourceIds = byType['sales_invoice_posting'].map(j => j.source_id!);
    const invs = await prisma.salesInvoice.findMany({ where: { id: { in: sourceIds } }, select: { id: true, approval: true } });
    const invMap = new Map(invs.map(i => [i.id, i]));
    for (const jv of byType['sales_invoice_posting']) {
      const inv = invMap.get(jv.source_id!);
      if (!inv) {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: 'Sales invoice deleted', source_type: 'sales_invoice_posting' });
        orphanEntries.push({ sourceType: 'sales_invoice_posting', sourceId: jv.source_id! });
      } else if (inv.approval !== 'approved') {
        orphans.push({ voucher: jv.voucher_number, description: jv.description ?? '', reason: `Sales invoice status: ${inv.approval}`, source_type: 'sales_invoice_posting' });
        orphanEntries.push({ sourceType: 'sales_invoice_posting', sourceId: jv.source_id! });
      }
    }
  }

  if (isDryRun) {
    return NextResponse.json({ data: { orphans, reversed: 0, message: `Found ${orphans.length} orphaned JVs.` }, error: null });
  }

  // Reverse unique orphans
  let reversed = 0;
  const seen = new Set<string>();
  for (const entry of orphanEntries) {
    const key = `${entry.sourceType}:${entry.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await reverseJVsForSource(entry.sourceType as 'claim_approval' | 'bank_recon' | 'invoice_posting' | 'sales_invoice_posting', entry.sourceId, session.user.id);
      reversed++;
    } catch (e) {
      console.error(`Failed to reverse JV for ${key}:`, e);
    }
  }

  return NextResponse.json({ data: { orphans, reversed, message: `Reversed ${reversed} orphaned JVs.` }, error: null });
}
