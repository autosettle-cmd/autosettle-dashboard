import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const firms = await prisma.firm.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ data: firms, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
