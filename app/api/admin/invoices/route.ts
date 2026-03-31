import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const status = searchParams.get('status');
  const paymentStatus = searchParams.get('paymentStatus');
  const supplierId = searchParams.get('supplierId');
  const overdue = searchParams.get('overdue');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };

  if (dateFrom || dateTo) {
    where.issue_date = {};
    if (dateFrom) where.issue_date.gte = new Date(dateFrom);
    if (dateTo) where.issue_date.lte = new Date(dateTo);
  }
  if (status && status !== 'all') where.status = status;
  if (paymentStatus && paymentStatus !== 'all') where.payment_status = paymentStatus;
  if (supplierId) where.supplier_id = supplierId;
  if (overdue === 'true') {
    where.due_date = { lt: new Date() };
    where.payment_status = { not: 'paid' };
  }
  if (search) {
    where.OR = [
      { vendor_name_raw: { contains: search, mode: 'insensitive' } },
      { invoice_number: { contains: search, mode: 'insensitive' } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      uploader: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: { issue_date: 'desc' },
  });

  const data = invoices.map((inv) => ({
    id: inv.id,
    vendor_name_raw: inv.vendor_name_raw,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    payment_terms: inv.payment_terms,
    subtotal: inv.subtotal?.toString() ?? null,
    tax_amount: inv.tax_amount?.toString() ?? null,
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    category_name: inv.category.name,
    category_id: inv.category_id,
    status: inv.status,
    payment_status: inv.payment_status,
    supplier_id: inv.supplier_id,
    supplier_name: inv.supplier?.name ?? null,
    supplier_link_status: inv.supplier_link_status,
    uploader_name: inv.uploader.name,
    confidence: inv.confidence,
    file_url: inv.file_url,
    thumbnail_url: inv.thumbnail_url,
    submitted_via: inv.submitted_via,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
