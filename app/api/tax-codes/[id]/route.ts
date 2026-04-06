import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const taxCode = await prisma.taxCode.findUnique({ where: { id } });
  if (!taxCode) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(taxCode.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { code, description, rate, tax_type, gl_account_id, is_active } = body;

  try {
    const updated = await prisma.taxCode.update({
      where: { id },
      data: {
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
        ...(rate !== undefined && { rate }),
        ...(tax_type !== undefined && { tax_type }),
        ...(gl_account_id !== undefined && { gl_account_id: gl_account_id || null }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update tax code';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A tax code with this code already exists for this firm' }, { status: 409 });
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
  const taxCode = await prisma.taxCode.findUnique({ where: { id } });
  if (!taxCode) {
    return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(taxCode.firm_id)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  // Soft delete — deactivate instead of removing
  await prisma.taxCode.update({ where: { id }, data: { is_active: false } });

  return NextResponse.json({ data: { id }, error: null });
}
