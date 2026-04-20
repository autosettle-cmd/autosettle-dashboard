import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search/preview?type=claim&id=xxx
 * Fetches a single entity by type+id for preview after global search navigation.
 * Returns the same shape as list APIs so preview panels can consume it directly.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });

  const type = request.nextUrl.searchParams.get('type');
  const id = request.nextUrl.searchParams.get('id');
  if (!type || !id) return NextResponse.json({ data: null, error: 'type and id required' }, { status: 400 });

  if (type === 'claim') {
    const claim = await prisma.claim.findUnique({
      where: { id },
      include: {
        employee: { select: { name: true } },
        firm: { select: { name: true } },
        category: { select: { name: true } },
        glAccount: { select: { id: true, account_code: true, name: true } },
        _count: { select: { paymentReceipts: true, invoiceReceiptLinks: true } },
        paymentReceipts: { include: { payment: { include: { supplier: { select: { name: true } }, employee: { select: { name: true } } } } } },
      },
    });
    if (!claim) return NextResponse.json({ data: null });
    return NextResponse.json({
      data: {
        id: claim.id,
        claim_date: claim.claim_date.toISOString(),
        employee_id: claim.employee_id,
        employee_name: claim.employee?.name ?? '',
        firm_name: claim.firm?.name ?? '',
        firm_id: claim.firm_id,
        merchant: claim.merchant,
        description: claim.description,
        category_id: claim.category_id ?? '',
        category_name: claim.category?.name ?? '',
        amount: claim.amount?.toString() ?? '0',
        status: claim.status,
        approval: claim.approval,
        payment_status: claim.payment_status,
        rejection_reason: claim.rejection_reason,
        thumbnail_url: claim.thumbnail_url,
        file_url: claim.file_url,
        confidence: claim.confidence,
        receipt_number: claim.receipt_number,
        type: claim.type,
        from_location: claim.from_location,
        to_location: claim.to_location,
        distance_km: claim.distance_km?.toString(),
        trip_purpose: claim.trip_purpose,
        gl_account_id: claim.gl_account_id,
        gl_account_label: claim.glAccount ? `${claim.glAccount.account_code} — ${claim.glAccount.name}` : null,
        contra_gl_account_id: claim.contra_gl_account_id,
        linked_payment_count: claim._count.paymentReceipts + claim._count.invoiceReceiptLinks,
        linked_payments: claim.paymentReceipts.map((pr) => ({
          payment_id: pr.payment_id,
          amount: pr.amount?.toString() ?? '0',
          payment_date: pr.payment?.payment_date?.toISOString() ?? '',
          reference: pr.payment?.reference ?? null,
          supplier_name: pr.payment?.supplier?.name ?? pr.payment?.employee?.name ?? '',
        })),
      },
    });
  }

  if (type === 'invoice') {
    const inv = await prisma.invoice.findUnique({
      where: { id },
      include: {
        firm: { select: { name: true } },
        supplier: { select: { id: true, name: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
        category: { select: { name: true } },
        glAccount: { select: { id: true, account_code: true, name: true } },
        contraGlAccount: { select: { id: true, account_code: true, name: true } },
        uploader: { select: { name: true } },
        lines: { orderBy: { sort_order: 'asc' }, select: { id: true, description: true, quantity: true, unit_price: true, tax_amount: true, line_total: true, gl_account_id: true, sort_order: true } },
      },
    });
    if (!inv) return NextResponse.json({ data: null });
    return NextResponse.json({
      data: {
        id: inv.id,
        firm_id: inv.firm_id,
        firm_name: inv.firm?.name ?? '',
        vendor_name_raw: inv.vendor_name_raw,
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date?.toISOString() ?? '',
        due_date: inv.due_date?.toISOString() ?? null,
        payment_terms: inv.payment_terms,
        subtotal: inv.subtotal?.toString() ?? '0',
        tax_amount: inv.tax_amount?.toString() ?? '0',
        total_amount: inv.total_amount?.toString() ?? '0',
        amount_paid: inv.amount_paid?.toString() ?? '0',
        status: inv.status,
        approval: inv.approval,
        payment_status: inv.payment_status,
        supplier_id: inv.supplier_id,
        supplier_name: inv.supplier?.name ?? null,
        supplier_link_status: inv.supplier_link_status,
        supplier_default_gl_id: inv.supplier?.default_gl_account_id ?? null,
        supplier_default_contra_gl_id: inv.supplier?.default_contra_gl_account_id ?? null,
        category_id: inv.category_id,
        category_name: inv.category?.name ?? null,
        file_url: inv.file_url,
        thumbnail_url: inv.thumbnail_url,
        notes: inv.notes,
        confidence: inv.confidence,
        uploader_name: inv.uploader?.name ?? '',
        rejection_reason: inv.rejection_reason,
        gl_account_id: inv.gl_account_id,
        gl_account_label: inv.glAccount ? `${inv.glAccount.account_code} — ${inv.glAccount.name}` : null,
        contra_gl_account_id: inv.contra_gl_account_id,
        contra_gl_account_label: inv.contraGlAccount ? `${inv.contraGlAccount.account_code} — ${inv.contraGlAccount.name}` : null,
        lines: inv.lines.map(l => ({
          id: l.id, description: l.description ?? '', quantity: l.quantity?.toString() ?? '1',
          unit_price: l.unit_price?.toString() ?? '0', tax_amount: l.tax_amount?.toString() ?? '0',
          line_total: l.line_total?.toString() ?? '0', gl_account_id: l.gl_account_id, gl_account_label: null, sort_order: l.sort_order,
        })),
      },
    });
  }

  if (type === 'supplier') {
    const sup = await prisma.supplier.findUnique({
      where: { id },
      include: { firm: { select: { name: true } }, _count: { select: { invoices: true } } },
    });
    if (!sup) return NextResponse.json({ data: null });
    return NextResponse.json({ data: { id: sup.id, name: sup.name, firm_id: sup.firm_id, firm_name: sup.firm?.name ?? '' } });
  }

  if (type === 'employee') {
    const emp = await prisma.employee.findUnique({
      where: { id },
      include: { firm: { select: { name: true } } },
    });
    if (!emp) return NextResponse.json({ data: null });
    return NextResponse.json({
      data: {
        id: emp.id, name: emp.name, phone: emp.phone, email: emp.email,
        firm_id: emp.firm_id, firm_name: emp.firm?.name ?? '',
        is_active: emp.is_active, claims_count: 0, outstanding: '0',
      },
    });
  }

  return NextResponse.json({ data: null, error: 'Unknown type' }, { status: 400 });
}
