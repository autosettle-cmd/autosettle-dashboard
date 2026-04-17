import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const alias = searchParams.get('alias');
  const firmId = searchParams.get('firmId');

  if (!alias || !firmId) {
    return NextResponse.json({ data: null, error: 'alias and firmId required' }, { status: 400 });
  }

  const match = await prisma.supplierAlias.findFirst({
    where: {
      alias: alias.toLowerCase().trim(),
      supplier: { firm_id: firmId },
    },
    include: {
      supplier: { select: { id: true, name: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
    },
  });

  if (!match) {
    return NextResponse.json({ data: null, error: null });
  }

  return NextResponse.json({
    data: {
      id: match.supplier.id,
      name: match.supplier.name,
      default_gl_account_id: match.supplier.default_gl_account_id,
      default_contra_gl_account_id: match.supplier.default_contra_gl_account_id,
    },
    error: null,
  });
}
