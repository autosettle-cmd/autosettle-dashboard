import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      select: { firm_id: true },
    });
    if (!supplier || supplier.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
    }

    const body = await request.json();
    if (!body.alias?.trim()) {
      return NextResponse.json({ data: null, error: 'Alias is required' }, { status: 400 });
    }

    const alias = await prisma.supplierAlias.create({
      data: {
        supplier_id: id,
        alias: body.alias.trim().toLowerCase(),
        is_confirmed: true,
      },
    });

    return NextResponse.json({ data: alias, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const body = await request.json();
    const aliasId = body.aliasId;
    if (!aliasId) {
      return NextResponse.json({ data: null, error: 'aliasId is required' }, { status: 400 });
    }

    // Verify alias belongs to this supplier
    const alias = await prisma.supplierAlias.findUnique({
      where: { id: aliasId },
      select: { supplier_id: true },
    });
    if (!alias || alias.supplier_id !== id) {
      return NextResponse.json({ data: null, error: 'Alias not found' }, { status: 404 });
    }

    await prisma.supplierAlias.delete({ where: { id: aliasId } });
    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
