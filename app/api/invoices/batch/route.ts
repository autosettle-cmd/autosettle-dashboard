import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { createJournalEntry, reverseJVsForSource } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { invoiceIds, action, reason, gl_account_id, contra_gl_account_id } = body as {
    invoiceIds: string[];
    action: 'approve' | 'reject' | 'revert';
    reason?: string;
    gl_account_id?: string;
    contra_gl_account_id?: string;
  };

  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return NextResponse.json({ data: null, error: 'invoiceIds required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject' && action !== 'revert') {
    return NextResponse.json({ data: null, error: 'Invalid action' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const scope = firmScope(firmIds);

  // Fetch invoices with data for JV creation + audit
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, ...scope },
    select: {
      id: true, firm_id: true, total_amount: true, issue_date: true,
      gl_account_id: true, approval: true, vendor_name_raw: true, supplier_id: true,
      category: { select: { name: true } },
      supplier: { select: { id: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
    },
  });
  const oldMap = new Map(invoices.map((inv) => [inv.id, inv]));

  // ─── Pre-validation for approve: block if JV cannot be created ─────────
  if (action === 'approve') {
    const errors: string[] = [];

    // Check contra GL — supplier's sub-account → firm default → provided
    const firmDefaultsMap = new Map<string, string | null>();
    for (const inv of invoices) {
      if (!firmDefaultsMap.has(inv.firm_id)) {
        const firm = await prisma.firm.findUnique({
          where: { id: inv.firm_id },
          select: { default_trade_payables_gl_id: true, name: true },
        });
        firmDefaultsMap.set(inv.firm_id, firm?.default_trade_payables_gl_id ?? null);
      }
      const contraGlId = contra_gl_account_id || inv.supplier?.default_contra_gl_account_id || firmDefaultsMap.get(inv.firm_id);
      if (!contraGlId) {
        errors.push(`No Trade Payables GL for ${inv.vendor_name_raw}. Select a Contra GL (Credit) account before approving.`);
      }
    }

    // Check each invoice — fall back to supplier's default GL
    for (const inv of invoices) {
      const expenseGlId = gl_account_id || inv.gl_account_id || inv.supplier?.default_gl_account_id;
      if (!expenseGlId) {
        errors.push(`Invoice from ${inv.vendor_name_raw} (${inv.category.name}) has no GL account assigned. Assign a GL account before approving.`);
      }
    }

    if (errors.length > 0) {
      const unique = Array.from(new Set(errors));
      return NextResponse.json({ data: null, error: unique.join('\n') }, { status: 400 });
    }
  }

  // ─── Proceed with update ───────────────────────────────────────────────
  const updateData =
    action === 'approve'
      ? { approval: 'approved' as const, status: 'reviewed' as const, rejection_reason: null as string | null, ...(gl_account_id && { gl_account_id }) }
      : action === 'revert'
      ? { approval: 'pending_approval' as const, rejection_reason: null as string | null }
      : { approval: 'not_approved' as const, rejection_reason: (reason ?? null) as string | null };

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < invoiceIds.length; i += CHUNK) {
    chunks.push(invoiceIds.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map((chunk) =>
      prisma.invoice.updateMany({
        where: { id: { in: chunk }, ...scope },
        data: updateData,
      })
    )
  );

  // ─── Create / reverse JVs ─────────────────────────────────────────────
  if (action === 'approve') {
    const firmDefaults = new Map<string, string | null>();
    for (const inv of invoices) {
      if (!firmDefaults.has(inv.firm_id)) {
        const firm = await prisma.firm.findUnique({
          where: { id: inv.firm_id },
          select: { default_trade_payables_gl_id: true },
        });
        firmDefaults.set(inv.firm_id, firm?.default_trade_payables_gl_id ?? null);
      }
    }

    for (const inv of invoices) {
      const expenseGlId = gl_account_id || inv.gl_account_id || inv.supplier?.default_gl_account_id;
      const contraGlId = contra_gl_account_id || inv.supplier?.default_contra_gl_account_id || firmDefaults.get(inv.firm_id);
      await createJournalEntry({
        firmId: inv.firm_id,
        postingDate: inv.issue_date,
        description: `${inv.category.name} — ${inv.vendor_name_raw}`,
        sourceType: 'invoice_posting',
        sourceId: inv.id,
        lines: [
          { glAccountId: expenseGlId!, debitAmount: Number(inv.total_amount), creditAmount: 0, description: inv.vendor_name_raw },
          { glAccountId: contraGlId!, debitAmount: 0, creditAmount: Number(inv.total_amount), description: 'Trade Payables' },
        ],
        createdBy: session.user.id,
      });

      // Save resolved GL on the invoice itself (so preview shows it)
      if (expenseGlId && !inv.gl_account_id) {
        await prisma.invoice.update({ where: { id: inv.id }, data: { gl_account_id: expenseGlId } });
      }

      // Save GL to supplier for future auto-fill (learn once per supplier)
      if (inv.supplier) {
        const updates: Record<string, string> = {};
        const resolvedGlId = gl_account_id || inv.gl_account_id;
        if (resolvedGlId && !inv.supplier.default_gl_account_id) {
          updates.default_gl_account_id = resolvedGlId;
        }
        const resolvedContraGlId = contra_gl_account_id;
        if (resolvedContraGlId && !inv.supplier.default_contra_gl_account_id) {
          updates.default_contra_gl_account_id = resolvedContraGlId;
        }
        if (Object.keys(updates).length > 0) {
          await prisma.supplier.update({ where: { id: inv.supplier.id }, data: updates });
        }
      }
    }
  }

  if (action === 'revert') {
    for (const inv of invoices) {
      if (inv.approval !== 'approved') continue;
      await reverseJVsForSource('invoice_posting', inv.id, session.user.id);
    }
  }

  // Audit log per invoice
  for (const inv of invoices) {
    await auditLog({
      firmId: inv.firm_id,
      tableName: 'Invoice',
      recordId: inv.id,
      action: 'update',
      oldValues: { approval: oldMap.get(inv.id)?.approval },
      newValues: { approval: updateData.approval, rejection_reason: updateData.rejection_reason },
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  return NextResponse.json({ data: { updated: invoiceIds.length }, error: null });
}
