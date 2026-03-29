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

  // Verify the category belongs to an assigned firm
  const category = await prisma.category.findUnique({
    where: { id },
    select: { firm_id: true },
  });

  if (!category) {
    return NextResponse.json({ data: null, error: 'Category not found' }, { status: 404 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(category.firm_id)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this category' }, { status: 403 });
  }

  const body = await request.json();
  const { is_active, name, tax_code } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (typeof is_active === 'boolean') data.is_active = is_active;
  if (name !== undefined) data.name = name;
  if (tax_code !== undefined) data.tax_code = tax_code || null;

  try {
    const updated = await prisma.category.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update category';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'A category with this name already exists for this firm' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
