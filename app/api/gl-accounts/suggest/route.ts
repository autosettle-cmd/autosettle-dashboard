import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const categoryId = searchParams.get('categoryId');
  const merchant = searchParams.get('merchant');
  const description = searchParams.get('description');

  if (!firmId || !categoryId) {
    return NextResponse.json({ data: null, error: 'firmId and categoryId required' }, { status: 400 });
  }
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 403 });
  }

  console.log('[GL Suggest] Request:', { firmId, categoryId, merchant, description: description?.slice(0, 80) });

  const baseWhere = {
    firm_id: firmId,
    category_id: categoryId,
    approval: 'approved' as const,
    gl_account_id: { not: null as unknown as string },
  };

  // Strategy 1: Description token match (phone numbers, account numbers) + merchant
  // Most specific — finds the exact sub-account used for this phone number
  if (description && merchant) {
    const tokens = description.match(/\d{6,}/g);
    if (tokens?.length) {
      for (const token of tokens) {
        const match = await prisma.claim.findFirst({
          where: {
            ...baseWhere,
            merchant: { contains: merchant, mode: 'insensitive' },
            description: { contains: token, mode: 'insensitive' },
          },
          orderBy: { created_at: 'desc' },
          select: { gl_account_id: true },
        });
        if (match?.gl_account_id) {
          const gl = await prisma.gLAccount.findUnique({
            where: { id: match.gl_account_id },
            select: { id: true, account_code: true, name: true },
          });
          if (gl) {
            console.log('[GL Suggest] Hit: description token', token, '->', gl.account_code);
            return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'description' }, error: null });
          }
        }
      }
    }
  }

  // Strategy 2: Merchant match — most recent approved claim with same merchant
  if (merchant) {
    const match = await prisma.claim.findFirst({
      where: {
        ...baseWhere,
        merchant: { contains: merchant, mode: 'insensitive' },
      },
      orderBy: { created_at: 'desc' },
      select: { gl_account_id: true },
    });
    if (match?.gl_account_id) {
      const gl = await prisma.gLAccount.findUnique({
        where: { id: match.gl_account_id },
        select: { id: true, account_code: true, name: true },
      });
      if (gl) {
        console.log('[GL Suggest] Hit: merchant ->', gl.account_code);
        return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'merchant' }, error: null });
      }
    }
  }

  // Strategy 3: Category-only — most recent approved claim in same category
  const match = await prisma.claim.findFirst({
    where: baseWhere,
    orderBy: { created_at: 'desc' },
    select: { gl_account_id: true },
  });
  if (match?.gl_account_id) {
    const gl = await prisma.gLAccount.findUnique({
      where: { id: match.gl_account_id },
      select: { id: true, account_code: true, name: true },
    });
    if (gl) {
      console.log('[GL Suggest] Hit: category ->', gl.account_code);
      return NextResponse.json({ data: { gl_account_id: gl.id, account_code: gl.account_code, account_name: gl.name, match_type: 'category' }, error: null });
    }
  }

  console.log('[GL Suggest] No match found');
  return NextResponse.json({ data: null, error: null });
}
