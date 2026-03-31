import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const receipts = await prisma.claim.findMany({
    where: {
      firm_id: firmId,
      type: 'receipt',
      paymentReceipts: { none: {} },
    },
    select: {
      id: true,
      receipt_number: true,
      merchant: true,
      amount: true,
      claim_date: true,
      thumbnail_url: true,
    },
    orderBy: { claim_date: 'desc' },
  });

  return NextResponse.json({
    data: receipts.map((r) => ({
      id: r.id,
      receipt_number: r.receipt_number,
      merchant: r.merchant,
      amount: r.amount.toString(),
      claim_date: r.claim_date,
      thumbnail_url: r.thumbnail_url,
    })),
  });
}
