import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.gLAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(account.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json({ data: account, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.gLAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(account.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { name, account_code, description, is_active, parent_id, sort_order, account_type, normal_balance } = body;

  try {
    const updated = await prisma.gLAccount.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(account_code !== undefined && { account_code }),
        ...(description !== undefined && { description }),
        ...(is_active !== undefined && { is_active }),
        ...(parent_id !== undefined && { parent_id: parent_id || null }),
        ...(sort_order !== undefined && { sort_order }),
        ...(account_type !== undefined && { account_type }),
        ...(normal_balance !== undefined && { normal_balance }),
      },
    });

    // Cascade account_type and normal_balance to children
    if (account_type !== undefined || normal_balance !== undefined) {
      await prisma.gLAccount.updateMany({
        where: { parent_id: id },
        data: {
          ...(account_type !== undefined && { account_type }),
          ...(normal_balance !== undefined && { normal_balance }),
        },
      });
    }

    await auditLog({
      firmId: account.firm_id,
      tableName: 'GLAccount',
      recordId: id,
      action: 'update',
      oldValues: { name: account.name, account_code: account.account_code, is_active: account.is_active, account_type: account.account_type, normal_balance: account.normal_balance },
      newValues: { name: updated.name, account_code: updated.account_code, is_active: updated.is_active, account_type: updated.account_type, normal_balance: updated.normal_balance },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update GL account';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'An account with this code already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.gLAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  if (account.is_system) {
    return NextResponse.json({ data: null, error: 'Cannot delete system accounts. Deactivate instead.' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(account.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  await prisma.gLAccount.delete({ where: { id } });

  await auditLog({
    firmId: account.firm_id,
    tableName: 'GLAccount',
    recordId: id,
    action: 'delete',
    oldValues: { account_code: account.account_code, name: account.name },
    userId: session.user.id,
    userName: session.user.name,
  });

  return NextResponse.json({ data: { id }, error: null });
}
