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

  const category = await prisma.category.findUnique({
    where: { id },
    select: { firm_id: true },
  });

  if (!category) {
    return NextResponse.json({ data: null, error: 'Category not found' }, { status: 404 });
  }

  const body = await request.json();
  const { is_active } = body;

  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ data: null, error: 'is_active (boolean) is required' }, { status: 400 });
  }

  if (category.firm_id === null) {
    // Global category — use override system
    try {
      const override = await prisma.categoryFirmOverride.upsert({
        where: {
          category_id_firm_id: { category_id: id, firm_id: firmId },
        },
        update: { is_active },
        create: { category_id: id, firm_id: firmId, is_active },
      });

      return NextResponse.json({ data: override, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update override';
      return NextResponse.json({ data: null, error: message }, { status: 500 });
    }
  } else {
    // Firm-specific — must belong to admin's firm
    if (category.firm_id !== firmId) {
      return NextResponse.json({ data: null, error: 'Not authorized for this category' }, { status: 403 });
    }

    try {
      const updated = await prisma.category.update({
        where: { id },
        data: { is_active },
      });

      return NextResponse.json({ data: updated, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update category';
      return NextResponse.json({ data: null, error: message }, { status: 500 });
    }
  }
}
