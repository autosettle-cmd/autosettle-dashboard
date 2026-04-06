import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { seedCoAForFirm } from '@/lib/seed-coa';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { firmId } = body;

  if (!firmId) {
    return NextResponse.json({ data: null, error: 'firmId is required' }, { status: 400 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(firmId)) {
    return NextResponse.json({ data: null, error: 'Firm not in your assigned firms' }, { status: 403 });
  }

  try {
    const result = await seedCoAForFirm(firmId);
    return NextResponse.json({ data: result, error: null }, { status: result.seeded ? 201 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to seed CoA';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
