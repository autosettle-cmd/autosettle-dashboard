import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    firm_id: firmId,
    type: 'receipt',
    paymentReceipts: { none: {} },
  };

  if (search) {
    where.OR = [
      { receipt_number: { contains: search, mode: 'insensitive' } },
      { merchant: { contains: search, mode: 'insensitive' } },
    ];
  }

  const receipts = await prisma.claim.findMany({
    where,
    select: {
      id: true,
      receipt_number: true,
      merchant: true,
      amount: true,
      claim_date: true,
      thumbnail_url: true,
      file_url: true,
    },
    orderBy: { claim_date: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    data: receipts.map((r) => ({
      id: r.id,
      receipt_number: r.receipt_number,
      merchant: r.merchant,
      amount: r.amount.toString(),
      claim_date: r.claim_date,
      thumbnail_url: r.thumbnail_url,
      file_url: r.file_url,
    })),
  });
}
