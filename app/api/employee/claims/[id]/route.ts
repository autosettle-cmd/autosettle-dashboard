import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'employee' || !session.user.employee_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  // Verify claim belongs to this employee
  const claim = await prisma.claim.findUnique({
    where: { id },
    select: { employee_id: true },
  });
  if (!claim || claim.employee_id !== session.user.employee_id) {
    return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
  }

  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.claim_date !== undefined) data.claim_date = new Date(body.claim_date);
  if (body.merchant !== undefined) data.merchant = body.merchant;
  if (body.amount !== undefined) data.amount = Number(body.amount);
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.receipt_number !== undefined) data.receipt_number = body.receipt_number || null;
  if (body.description !== undefined) data.description = body.description || null;

  // Reset status when employee edits — needs re-review
  data.status = 'pending_review';
  data.approval = 'pending_approval';

  const updated = await prisma.claim.update({ where: { id }, data });
  return NextResponse.json({ data: updated, error: null });
}
