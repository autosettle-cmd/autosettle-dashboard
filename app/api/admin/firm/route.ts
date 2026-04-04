import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firm = await prisma.firm.findUnique({
    where: { id: session.user.firm_id },
    select: { id: true, name: true },
  });

  return NextResponse.json({ data: firm });
}
