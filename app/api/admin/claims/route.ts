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
  const search = searchParams.get('search');
  const type = searchParams.get('type');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };
  if (type && (type === 'claim' || type === 'receipt')) where.type = type;

  if (dateFrom || dateTo) {
    where.claim_date = {};
    if (dateFrom) where.claim_date.gte = new Date(dateFrom);
    if (dateTo) where.claim_date.lte = new Date(dateTo);
  }
  if (status && status !== 'all') where.status = status;
  if (search) {
    where.OR = [
      { merchant: { contains: search, mode: 'insensitive' } },
      { employee: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const claims = await prisma.claim.findMany({
    where,
    include: {
      employee: { select: { name: true } },
      category: { select: { name: true } },
      _count: { select: { paymentReceipts: true } },
    },
    orderBy: { claim_date: 'desc' },
  });

  const data = claims.map((c) => ({
    id: c.id,
    claim_date: c.claim_date,
    employee_name: c.employee.name,
    merchant: c.merchant,
    description: c.description,
    category_name: c.category.name,
    category_id: c.category_id,
    amount: c.amount.toString(),
    status: c.status,
    approval: c.approval,
    payment_status: c.payment_status,
    rejection_reason: c.rejection_reason,
    receipt_number: c.receipt_number,
    file_url: c.file_url,
    thumbnail_url: c.thumbnail_url,
    confidence: c.confidence,
    submitted_via: c.submitted_via,
    type: c.type,
    linked_payment_count: c._count.paymentReceipts,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
