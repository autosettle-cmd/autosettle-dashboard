import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { id } = await params;

  // Verify receipt belongs to admin's firm
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    select: { firm_id: true },
  });

  if (!receipt) {
    return NextResponse.json({ data: null, error: 'Receipt not found' }, { status: 404 });
  }
  if (receipt.firm_id !== firmId) {
    return NextResponse.json({ data: null, error: 'Not authorized for this receipt' }, { status: 403 });
  }

  const body = await request.json();
  const { receipt_date, merchant, amount, category_id, receipt_number } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { approval: 'pending_approval' };
  if (receipt_date !== undefined) data.receipt_date = new Date(receipt_date);
  if (merchant !== undefined) data.merchant = merchant;
  if (amount !== undefined) data.amount = amount;
  if (category_id !== undefined) data.category_id = category_id;
  if (receipt_number !== undefined) data.receipt_number = receipt_number || null;

  const updated = await prisma.receipt.update({
    where: { id },
    data,
  });

  return NextResponse.json({ data: updated, error: null });
}
