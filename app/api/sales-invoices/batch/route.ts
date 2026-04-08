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
  const { salesInvoiceIds, action, reason, gl_account_id, contra_gl_account_id } = body as {
    salesInvoiceIds: string[];
    action: 'approve' | 'reject' | 'revert';
    reason?: string;
    gl_account_id?: string;
    contra_gl_account_id?: string;
  };

  if (!Array.isArray(salesInvoiceIds) || salesInvoiceIds.length === 0) {
    return NextResponse.json({ data: null, error: 'salesInvoiceIds required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject' && action !== 'revert') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const scope = firmScope(firmIds);

  const oldInvoices = await prisma.salesInvoice.findMany({
    where: { id: { in: salesInvoiceIds }, ...scope },
    select: {
      id: true, firm_id: true, approval: true, total_amount: true,
      issue_date: true, gl_account_id: true, invoice_number: true,
      buyer: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  const oldMap = new Map(oldInvoices.map((inv) => [inv.id, inv]));

  // ─── Pre-validation for approve ───────────────────────────────────────
  if (action === 'approve') {
    const errors: string[] = [];

    // Each invoice needs a revenue GL (debit side)
    for (const inv of oldInvoices) {
      const revenueGlId = gl_account_id || inv.gl_account_id;
      if (!revenueGlId) {
        errors.push(`Sales invoice ${inv.invoice_number} to ${inv.buyer.name} has no GL account assigned. Assign a GL account before approving.`);
      }
    }

    // Contra GL (Trade Receivables) must be provided
    if (!contra_gl_account_id) {
      errors.push('Contra GL account (Trade Receivables) is required for sales invoice approval.');
    }

    // Check fiscal periods
    const checkedPeriods = new Set<string>();
    for (const inv of oldInvoices) {
      const periodKey = `${inv.firm_id}|${inv.issue_date.toISOString().split('T')[0]}`;
      if (checkedPeriods.has(periodKey)) continue;
      checkedPeriods.add(periodKey);
      try {
        await findOpenPeriod(prisma, inv.firm_id, inv.issue_date);
      } catch {
        const dateStr = inv.issue_date.toISOString().split('T')[0];
        errors.push(`No open fiscal period for date ${dateStr}. Go to Fiscal Periods to create or open a period covering this date.`);
      }
    }

    if (errors.length > 0) {
      const unique = Array.from(new Set(errors));
      return NextResponse.json({ data: null, error: unique.join('\n') }, { status: 400 });
    }
  }

  // ─── Proceed with update ──────────────────────────────────────────────
  const updateData =
    action === 'approve'
      ? { approval: 'approved' as const, ...(gl_account_id && { gl_account_id }) }
      : action === 'revert'
      ? { approval: 'pending_approval' as const }
      : { approval: 'not_approved' as const };

  await prisma.salesInvoice.updateMany({
    where: { id: { in: salesInvoiceIds }, ...scope },
    data: updateData,
  });

  // ─── Create / reverse JVs ────────────────────────────────────────────
  if (action === 'approve') {
    for (const inv of oldInvoices) {
      const revenueGlId = gl_account_id || inv.gl_account_id;
      // DR Trade Receivables (contra) / CR Revenue GL
      await createJournalEntry({
        firmId: inv.firm_id,
        postingDate: inv.issue_date,
        description: `Sales — ${inv.buyer.name} — ${inv.invoice_number}`,
        sourceType: 'sales_invoice_posting',
        sourceId: inv.id,
        lines: [
          { glAccountId: contra_gl_account_id!, debitAmount: Number(inv.total_amount), creditAmount: 0, description: 'Trade Receivables' },
          { glAccountId: revenueGlId!, debitAmount: 0, creditAmount: Number(inv.total_amount), description: inv.buyer.name },
        ],
        createdBy: session.user.id,
      });
    }
  }

  if (action === 'revert') {
    for (const inv of oldInvoices) {
      if (inv.approval !== 'approved') continue;
      await reverseJVsForSource('sales_invoice_posting', inv.id, session.user.id);
    }
  }

  // Audit log
  for (const inv of oldInvoices) {
    await auditLog({
      firmId: inv.firm_id,
      tableName: 'SalesInvoice',
      recordId: inv.id,
      action: 'update',
      oldValues: { approval: oldMap.get(inv.id)?.approval },
      newValues: { approval: updateData.approval },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { updated: salesInvoiceIds.length }, error: null });
}
