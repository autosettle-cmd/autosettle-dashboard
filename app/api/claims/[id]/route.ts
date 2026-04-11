import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { reverseJVsForSource } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

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

  const claim = await prisma.claim.findUnique({ where: { id } });
  if (!claim) return NextResponse.json({ data: null, error: 'Claim not found' }, { status: 404 });
  if (firmIds && !firmIds.includes(claim.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  // Reverse JV if claim was approved (editing resets approval)
  if (claim.approval === 'approved') {
    await reverseJVsForSource('claim_approval', claim.id, session.user.id);
  }

  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { status: 'reviewed', approval: 'pending_approval', gl_account_id: null };
  if (body.claim_date !== undefined) data.claim_date = new Date(body.claim_date);
  if (body.merchant !== undefined) data.merchant = body.merchant;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.receipt_number !== undefined) data.receipt_number = body.receipt_number || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.employee_id !== undefined) data.employee_id = body.employee_id;

  const updated = await prisma.claim.update({ where: { id }, data });

  await auditLog({
    firmId: claim!.firm_id,
    tableName: 'Claim',
    recordId: id,
    action: 'update',
    oldValues: { status: claim!.status, approval: claim!.approval, category_id: claim!.category_id, amount: String(claim!.amount), gl_account_id: claim!.gl_account_id },
    newValues: { status: updated.status, approval: updated.approval, category_id: updated.category_id, amount: String(updated.amount), gl_account_id: updated.gl_account_id },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ data: updated, error: null });
}
