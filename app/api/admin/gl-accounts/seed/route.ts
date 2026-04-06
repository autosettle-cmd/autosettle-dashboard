import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { seedCoAForFirm } from '@/lib/seed-coa';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await seedCoAForFirm(session.user.firm_id);
    return NextResponse.json({ data: result, error: null }, { status: result.seeded ? 201 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to seed CoA';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
