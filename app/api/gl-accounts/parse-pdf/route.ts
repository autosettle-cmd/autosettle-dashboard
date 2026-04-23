import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { parseCoaPdf } from '@/lib/coa-parser';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ data: null, error: 'Only PDF files are supported' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const accounts = await parseCoaPdf(buffer);

    return NextResponse.json({
      data: { accounts, count: accounts.length },
      error: null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse COA PDF';
    console.error('[COA Parse PDF]', message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
