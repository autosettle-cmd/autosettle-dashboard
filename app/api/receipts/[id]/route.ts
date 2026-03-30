import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

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

  const receipt = await prisma.receipt.findUnique({ where: { id }, select: { firm_id: true } });
  if (!receipt) return NextResponse.json({ data: null, error: 'Receipt not found' }, { status: 404 });
  if (firmIds && !firmIds.includes(receipt.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.receipt_date !== undefined) data.receipt_date = new Date(body.receipt_date);
  if (body.merchant !== undefined) data.merchant = body.merchant;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.receipt_number !== undefined) data.receipt_number = body.receipt_number || null;

  const updated = await prisma.receipt.update({ where: { id }, data });
  return NextResponse.json({ data: updated, error: null });
}
