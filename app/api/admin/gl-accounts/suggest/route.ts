import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');
  const merchant = searchParams.get('merchant');
  const description = searchParams.get('description');

  if (!categoryId) {
    return NextResponse.json({ data: null, error: 'categoryId required' }, { status: 400 });
  }

  const baseWhere = {
    firm_id: firmId,
    category_id: categoryId,
    approval: 'approved' as const,
    gl_account_id: { not: null as unknown as string },
  };

  // Strategy 1: Description token match + merchant (most specific)
  if (description && merchant) {
    const tokens = description.match(/\d{6,}/g);
    if (tokens?.length) {
      for (const token of tokens) {
        const match = await prisma.claim.findFirst({
          where: { ...baseWhere, merchant: { contains: merchant, mode: 'insensitive' }, description: { contains: token, mode: 'insensitive' } },
          orderBy: { created_at: 'desc' },
          select: { gl_account_id: true },
        });
        if (match?.gl_account_id) {
          const gl = await prisma.gLAccount.findUnique({ where: { id: match.gl_account_id }, select: { id: true, account_code: true, name: true } });
          if (gl) return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'description' }, error: null });
        }
      }
    }
  }

  // Strategy 2: Merchant match (most recent)
  if (merchant) {
    const match = await prisma.claim.findFirst({
      where: { ...baseWhere, merchant: { contains: merchant, mode: 'insensitive' } },
      orderBy: { created_at: 'desc' },
      select: { gl_account_id: true },
    });
    if (match?.gl_account_id) {
      const gl = await prisma.gLAccount.findUnique({ where: { id: match.gl_account_id }, select: { id: true, account_code: true, name: true } });
      if (gl) return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'merchant' }, error: null });
    }
  }

  // Strategy 3: Category-only (most recent)
  const match = await prisma.claim.findFirst({
    where: baseWhere,
    orderBy: { created_at: 'desc' },
    select: { gl_account_id: true },
  });
  if (match?.gl_account_id) {
    const gl = await prisma.gLAccount.findUnique({ where: { id: match.gl_account_id }, select: { id: true, account_code: true, name: true } });
    if (gl) return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'category' }, error: null });
  }

  return NextResponse.json({ data: null, error: null });
}
