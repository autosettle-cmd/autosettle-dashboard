import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    session.user.role !== 'employee' ||
    !session.user.employee_id
  ) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const firmId = session.user.firm_id;

  if (!firmId) {
    return NextResponse.json(
      { data: null, error: 'Employee has no firm assigned' },
      { status: 400 }
    );
  }

  const categories = await prisma.category.findMany({
    where: { firm_id: firmId, is_active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ data: categories, error: null });
}
