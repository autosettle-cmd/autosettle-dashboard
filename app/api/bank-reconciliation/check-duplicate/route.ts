import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bank-reconciliation/check-duplicate
 * Quick file hash check before uploading — returns duplicate info if found.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ data: { isDuplicate: false }, error: null });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buf).digest('hex');

  const existing = await prisma.bankStatement.findUnique({
    where: { file_hash: fileHash },
    select: { id: true, bank_name: true, account_number: true, statement_date: true, file_name: true },
  });

  if (existing) {
    const date = existing.statement_date
      ? new Date(existing.statement_date).toISOString().split('T')[0]
      : '';
    return NextResponse.json({
      data: {
        isDuplicate: true,
        message: `Duplicate: "${existing.file_name}" already uploaded (${existing.bank_name} ${existing.account_number ?? ''} — ${date})`,
      },
      error: null,
    });
  }

  return NextResponse.json({ data: { isDuplicate: false, fileHash }, error: null });
}
