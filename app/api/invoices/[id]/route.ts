import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';


export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const firmIds = await getAccountantFirmIds(session.user.id);

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: {
      uploader: { select: { name: true } },
      firm: { select: { name: true } },
      supplier: { select: { id: true, name: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
      category: { select: { name: true } },
      glAccount: { select: { id: true, account_code: true, name: true } },
      contraGlAccount: { select: { id: true, account_code: true, name: true } },
      lines: { include: { glAccount: { select: { id: true, account_code: true, name: true } } }, orderBy: { sort_order: 'asc' } },
    },
  });

  if (!inv || (firmIds && !firmIds.includes(inv.firm_id))) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: inv.id, vendor_name_raw: inv.vendor_name_raw, invoice_number: inv.invoice_number,
      issue_date: inv.issue_date, due_date: inv.due_date, payment_terms: inv.payment_terms,
      subtotal: inv.subtotal?.toString() ?? null, tax_amount: inv.tax_amount?.toString() ?? null,
      total_amount: inv.total_amount.toString(), amount_paid: inv.amount_paid.toString(),
      category_name: inv.category.name, category_id: inv.category_id,
      status: inv.status, payment_status: inv.payment_status,
      supplier_id: inv.supplier_id, supplier_name: inv.supplier?.name ?? null,
      supplier_link_status: inv.supplier_link_status,
      uploader_name: inv.uploader.name, firm_name: inv.firm.name, firm_id: inv.firm_id,
      confidence: inv.confidence, file_url: inv.file_url, thumbnail_url: inv.thumbnail_url,
      notes: inv.notes, gl_account_id: inv.gl_account_id,
      gl_account_label: inv.glAccount ? `${inv.glAccount.account_code} — ${inv.glAccount.name}` : null,
      contra_gl_account_id: inv.contra_gl_account_id,
      contra_gl_account_label: inv.contraGlAccount ? `${inv.contraGlAccount.account_code} — ${inv.contraGlAccount.name}` : null,
      supplier_default_gl_id: inv.supplier?.default_gl_account_id ?? null,
      supplier_default_contra_gl_id: inv.supplier?.default_contra_gl_account_id ?? null,
      approval: inv.approval, rejection_reason: inv.rejection_reason,
      lines: inv.lines.map(l => ({
        id: l.id, description: l.description, quantity: l.quantity.toString(),
        unit_price: l.unit_price.toString(), tax_amount: l.tax_amount.toString(),
        line_total: l.line_total.toString(), gl_account_id: l.gl_account_id,
        gl_account_label: l.glAccount ? `${l.glAccount.account_code} — ${l.glAccount.name}` : null,
        sort_order: l.sort_order,
      })),
    },
    error: null,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const firmIds = await getAccountantFirmIds(session.user.id);
  const invoice = await prisma.invoice.findUnique({
    where: { id },
  });

  if (!invoice) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }
  if (firmIds && !firmIds.includes(invoice.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};

  if (body.vendor_name_raw !== undefined) data.vendor_name_raw = body.vendor_name_raw;
  if (body.invoice_number !== undefined) data.invoice_number = body.invoice_number || null;
  if (body.issue_date !== undefined && body.issue_date) {
    const parsed = new Date(body.issue_date);
    if (!isNaN(parsed.getTime())) data.issue_date = parsed;
  }
  if (body.due_date !== undefined) data.due_date = body.due_date ? new Date(body.due_date) : null;
  if (body.payment_terms !== undefined) data.payment_terms = body.payment_terms || null;
  if (body.subtotal !== undefined) data.subtotal = body.subtotal ? Number(body.subtotal) : null;
  if (body.tax_amount !== undefined) data.tax_amount = body.tax_amount ? Number(body.tax_amount) : null;
  if (body.total_amount !== undefined) data.total_amount = body.total_amount ? Number(body.total_amount) : undefined;
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.amount_paid !== undefined) {
    data.amount_paid = body.amount_paid;
    const totalAmount = body.total_amount ?? (await prisma.invoice.findUnique({ where: { id }, select: { total_amount: true } }))?.total_amount;
    if (totalAmount) {
      const paid = Number(body.amount_paid);
      const total = Number(totalAmount);
      if (paid >= total) data.payment_status = 'paid';
      else if (paid > 0) data.payment_status = 'partially_paid';
      else data.payment_status = 'unpaid';
    }
  }
  if (body.payment_status !== undefined) data.payment_status = body.payment_status;
  if (body.status !== undefined) data.status = body.status;
  if (body.gl_account_id !== undefined) data.gl_account_id = body.gl_account_id || null;

  if (body.supplier_id !== undefined) {
    data.supplier_id = body.supplier_id;
    data.supplier_link_status = 'confirmed';

    const inv = await prisma.invoice.findUnique({ where: { id }, select: { vendor_name_raw: true } });
    if (inv) {
      const normalizedVendor = inv.vendor_name_raw.toLowerCase().trim();
      await prisma.supplierAlias.upsert({
        where: { supplier_id_alias: { supplier_id: body.supplier_id, alias: normalizedVendor } },
        update: { is_confirmed: true },
        create: { supplier_id: body.supplier_id, alias: normalizedVendor, is_confirmed: true },
      });
    }
  }
  if (body.supplier_link_status !== undefined) data.supplier_link_status = body.supplier_link_status;

  // Block financial edits on approved invoices — must revert approval first
  const hasLines = Array.isArray(body.lines);
  const financialFields = ['vendor_name_raw', 'total_amount', 'subtotal', 'tax_amount', 'category_id', 'gl_account_id', 'issue_date'];
  const hasFinancialChange = financialFields.some(f => f in data) || hasLines;
  if (invoice.approval === 'approved' && hasFinancialChange) {
    return NextResponse.json({ data: null, error: 'Cannot edit an approved invoice. Revert approval first.' }, { status: 400 });
  }

  try {
    // Handle line items: replace-all strategy
    if (hasLines) {
      // Delete existing lines
      await prisma.invoiceLine.deleteMany({ where: { invoice_id: id } });

      const lines = body.lines as Array<{
        description: string; quantity?: number; unit_price: number;
        tax_amount?: number; line_total: number; gl_account_id?: string; sort_order?: number;
      }>;

      if (lines.length > 0) {
        await prisma.invoiceLine.createMany({
          data: lines.map((l, i) => ({
            invoice_id: id,
            description: l.description,
            quantity: l.quantity ?? 1,
            unit_price: l.unit_price,
            tax_amount: l.tax_amount ?? 0,
            line_total: l.line_total,
            gl_account_id: l.gl_account_id || null,
            sort_order: l.sort_order ?? i,
          })),
        });

        // Recalculate invoice totals from lines
        const totalAmount = lines.reduce((sum, l) => sum + Number(l.line_total), 0);
        const totalTax = lines.reduce((sum, l) => sum + Number(l.tax_amount ?? 0), 0);
        data.total_amount = totalAmount;
        data.subtotal = totalAmount - totalTax;
        data.tax_amount = totalTax;
      }
    }

    const updated = await prisma.invoice.update({ where: { id }, data });

    await auditLog({
      firmId: invoice!.firm_id,
      tableName: 'Invoice',
      recordId: id,
      action: 'update',
      oldValues: { status: invoice!.status, payment_status: invoice!.payment_status, supplier_id: invoice!.supplier_id, total_amount: String(invoice!.total_amount), gl_account_id: invoice!.gl_account_id },
      newValues: { status: updated.status, payment_status: updated.payment_status, supplier_id: updated.supplier_id, total_amount: String(updated.total_amount), gl_account_id: updated.gl_account_id },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    console.error('Invoice PATCH error:', err, 'Data:', JSON.stringify(data));
    return NextResponse.json({ data: null, error: `Save failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
