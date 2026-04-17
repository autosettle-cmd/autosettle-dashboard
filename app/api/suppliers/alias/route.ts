import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { supplier_id, alias } = await request.json();
  if (!supplier_id || !alias) {
    return NextResponse.json({ data: null, error: 'supplier_id and alias required' }, { status: 400 });
  }

  const normalized = alias.toLowerCase().trim();

  await prisma.supplierAlias.upsert({
    where: { supplier_id_alias: { supplier_id, alias: normalized } },
    update: {},
    create: { supplier_id, alias: normalized, is_confirmed: true },
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
