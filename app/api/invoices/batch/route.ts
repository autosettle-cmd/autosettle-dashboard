import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { batchAuditLog } from '@/lib/audit';
import { createJournalEntry, reverseJournalEntry } from '@/lib/journal-entries';

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
      lines: { select: { description: true, line_total: true, gl_account_id: true } },
    },
  });
  const oldMap = new Map(invoices.map((inv) => [inv.id, inv]));

  // ─── Pre-validation for approve: block if JV cannot be created ─────────
  // Pre-fetch all firm defaults in a single query (replaces N lookups)
  const firmDefaultsMap = new Map<string, string | null>();
  if (action === 'approve') {
    const uniqueFirmIds = Array.from(new Set(invoices.map((inv) => inv.firm_id)));
    const firms = await prisma.firm.findMany({
      where: { id: { in: uniqueFirmIds } },
      select: { id: true, default_trade_payables_gl_id: true },
    });
    for (const f of firms) {
      firmDefaultsMap.set(f.id, f.default_trade_payables_gl_id ?? null);
    }

    const errors: string[] = [];

    // Check contra GL — supplier's sub-account → firm default → provided
    for (const inv of invoices) {
      const contraGlId = contra_gl_account_id || inv.supplier?.default_contra_gl_account_id || firmDefaultsMap.get(inv.firm_id);
      if (!contraGlId) {
        errors.push(`No Trade Payables GL for ${inv.vendor_name_raw}. Select a Contra GL (Credit) account before approving.`);
      }
    }

    // Check each invoice — fall back to supplier's default GL
    for (const inv of invoices) {
      if (inv.lines.length > 0) {
        // Line items mode: each line must resolve to a GL
        const fallbackGl = gl_account_id || inv.gl_account_id || inv.supplier?.default_gl_account_id;
        for (const line of inv.lines) {
          if (!line.gl_account_id && !fallbackGl) {
            errors.push(`Line "${line.description}" on invoice from ${inv.vendor_name_raw} has no GL account. Assign GL accounts to all line items before approving.`);
          }
        }
      } else {
        const expenseGlId = gl_account_id || inv.gl_account_id || inv.supplier?.default_gl_account_id;
        if (!expenseGlId) {
          errors.push(`Invoice from ${inv.vendor_name_raw} (${inv.category.name}) has no GL account assigned. Assign a GL account before approving.`);
        }
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
      ? { approval: 'approved' as const, status: 'reviewed' as const, rejection_reason: null as string | null, supplier_link_status: 'confirmed' as const, ...(gl_account_id && { gl_account_id }) }
      : action === 'revert'
      ? { approval: 'pending_approval' as const, rejection_reason: null as string | null }
      : { approval: 'not_approved' as const, rejection_reason: (reason ?? null) as string | null };

  // ─── Approve: transactional — invoice update + JV + supplier learning ──
  if (action === 'approve') {
    await prisma.$transaction(async (tx) => {
      // Update all invoices to approved
      const CHUNK = 20;
      const chunks: string[][] = [];
      for (let i = 0; i < invoiceIds.length; i += CHUNK) {
        chunks.push(invoiceIds.slice(i, i + CHUNK));
      }
      await Promise.all(
        chunks.map((chunk) =>
          tx.invoice.updateMany({
            where: { id: { in: chunk }, ...scope },
            data: updateData,
          })
        )
      );

      // Create JVs + save GL to invoices and suppliers
      for (const inv of invoices) {
        const expenseGlId = gl_account_id || inv.gl_account_id || inv.supplier?.default_gl_account_id;
        const contraGlId = contra_gl_account_id || inv.supplier?.default_contra_gl_account_id || firmDefaultsMap.get(inv.firm_id);
        const amount = Math.abs(Number(inv.total_amount));
        const isCreditNote = Number(inv.total_amount) < 0;

        // Build JV lines: multi-debit when line items exist, single debit otherwise
        let jvLines: { glAccountId: string; debitAmount: number; creditAmount: number; description?: string }[];

        if (inv.lines.length > 0) {
          const glTotals = new Map<string, number>();
          for (const line of inv.lines) {
            const lineGlId = line.gl_account_id || expenseGlId!;
            glTotals.set(lineGlId, (glTotals.get(lineGlId) || 0) + Math.abs(Number(line.line_total)));
          }

          const debitLines = Array.from(glTotals.entries()).map(([glId, amt]) => ({
            glAccountId: glId,
            debitAmount: isCreditNote ? 0 : amt,
            creditAmount: isCreditNote ? amt : 0,
            description: inv.vendor_name_raw,
          }));

          const contraLine = {
            glAccountId: contraGlId!,
            debitAmount: isCreditNote ? amount : 0,
            creditAmount: isCreditNote ? 0 : amount,
            description: isCreditNote ? 'Trade Payables (reversal)' : 'Trade Payables',
          };

          jvLines = isCreditNote ? [contraLine, ...debitLines] : [...debitLines, contraLine];
        } else {
          jvLines = isCreditNote
            ? [
                { glAccountId: contraGlId!, debitAmount: amount, creditAmount: 0, description: 'Trade Payables (reversal)' },
                { glAccountId: expenseGlId!, debitAmount: 0, creditAmount: amount, description: inv.vendor_name_raw },
              ]
            : [
                { glAccountId: expenseGlId!, debitAmount: amount, creditAmount: 0, description: inv.vendor_name_raw },
                { glAccountId: contraGlId!, debitAmount: 0, creditAmount: amount, description: 'Trade Payables' },
              ];
        }

        await createJournalEntry({
          firmId: inv.firm_id,
          postingDate: inv.issue_date,
          description: `${isCreditNote ? 'Credit Note' : inv.category.name} — ${inv.vendor_name_raw}`,
          sourceType: 'invoice_posting',
          sourceId: inv.id,
          lines: jvLines,
          createdBy: session.user.id,
          tx,
        });

        // Save resolved GL on the invoice itself (so preview shows it)
        const glUpdates: Record<string, string> = {};
        if (expenseGlId && !inv.gl_account_id) glUpdates.gl_account_id = expenseGlId;
        if (contraGlId) glUpdates.contra_gl_account_id = contraGlId;
        if (Object.keys(glUpdates).length > 0) {
          await tx.invoice.update({ where: { id: inv.id }, data: glUpdates });
        }

        // Save GL to supplier for future auto-fill (skip when multiple GLs — no single default)
        const uniqueLineGls = new Set(inv.lines.map(l => l.gl_account_id).filter(Boolean));
        if (inv.supplier && uniqueLineGls.size <= 1) {
          const updates: Record<string, string> = {};
          // Use full resolution chain so invoice record matches the GL used in JV
          const resolvedGlId = gl_account_id || inv.gl_account_id || inv.supplier.default_gl_account_id;
          if (resolvedGlId && !inv.supplier.default_gl_account_id) {
            updates.default_gl_account_id = resolvedGlId;
          }
          // Always save resolved contra GL — improves future auto-fill
          if (contraGlId) {
            updates.default_contra_gl_account_id = contraGlId;
          }
          if (Object.keys(updates).length > 0) {
            await tx.supplier.update({ where: { id: inv.supplier.id }, data: updates });
          }
        }
      }
    });
  }

  // ─── Reject / Revert: non-transactional (safe — no JV creation) ───────
  if (action !== 'approve') {
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
  }

  if (action === 'revert') {
    // Batch-fetch all posted JVs for approved invoices in one query (instead of N findMany)
    const approvedIds = invoices.filter((inv) => inv.approval === 'approved').map((inv) => inv.id);
    if (approvedIds.length > 0) {
      const jvs = await prisma.journalEntry.findMany({
        where: { source_type: 'invoice_posting', source_id: { in: approvedIds }, status: 'posted', reversed_by_id: null },
        include: { lines: true },
      });
      for (const jv of jvs) {
        await reverseJournalEntry(jv.id, session.user.id);
      }
    }
  }

  // Batch audit log (single INSERT instead of N)
  batchAuditLog(
    invoices.map((inv) => ({
      firmId: inv.firm_id,
      tableName: 'Invoice',
      recordId: inv.id,
      action: 'update' as const,
      oldValues: { approval: oldMap.get(inv.id)?.approval },
      newValues: { approval: updateData.approval, rejection_reason: updateData.rejection_reason },
      userId: session.user.id,
      userName: session.user.name,
    }))
  );

  return NextResponse.json({ data: { updated: invoiceIds.length }, error: null });
}
