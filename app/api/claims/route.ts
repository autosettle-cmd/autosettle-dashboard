import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const approval = searchParams.get('approval');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (firmId) where.firm_id = firmId;
  if (dateFrom || dateTo) {
    where.claim_date = {};
    if (dateFrom) where.claim_date.gte = new Date(dateFrom);
    if (dateTo) where.claim_date.lte = new Date(dateTo);
  }
  if (approval && approval !== 'all') where.approval = approval;
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
      firm: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { claim_date: 'desc' },
  });

  const data = claims.map((c) => ({
    id: c.id,
    claim_date: c.claim_date,
    employee_name: c.employee.name,
    firm_name: c.firm.name,
    firm_id: c.firm_id,
    merchant: c.merchant,
    description: c.description,
    category_name: c.category.name,
    amount: c.amount.toString(),
    status: c.status,
    approval: c.approval,
    payment_status: c.payment_status,
    rejection_reason: c.rejection_reason,
    thumbnail_url: c.thumbnail_url,
    file_url: c.file_url,
    confidence: c.confidence,
    receipt_number: c.receipt_number,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
