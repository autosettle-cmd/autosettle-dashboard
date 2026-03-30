import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const approval = searchParams.get('approval');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };

  if (dateFrom || dateTo) {
    where.receipt_date = {};
    if (dateFrom) where.receipt_date.gte = new Date(dateFrom);
    if (dateTo) where.receipt_date.lte = new Date(dateTo);
  }
  if (approval && approval !== 'all') where.approval = approval;
  if (search) {
    where.OR = [
      { merchant: { contains: search, mode: 'insensitive' } },
      { uploader: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const receipts = await prisma.receipt.findMany({
    where,
    include: {
      uploader: { select: { name: true } },
      firm: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: { receipt_date: 'desc' },
  });

  const data = receipts.map((r) => ({
    id: r.id,
    receipt_date: r.receipt_date,
    uploader_name: r.uploader.name,
    firm_name: r.firm.name,
    firm_id: r.firm_id,
    merchant: r.merchant,
    category_name: r.category.name,
    category_id: r.category_id,
    amount: r.amount.toString(),
    approval: r.approval,
    receipt_number: r.receipt_number,
    thumbnail_url: r.thumbnail_url,
    file_url: r.file_url,
    file_download_url: r.file_download_url,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}
