import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadToDrive, getDriveViewUrl } from '@/lib/whatsapp/drive';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const statementId = formData.get('statement_id') as string | null;

    if (!file || !statementId) {
      return NextResponse.json({ data: null, error: 'file and statement_id required' }, { status: 400 });
    }

    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId, firm_id: session.user.firm_id },
      select: { id: true, bank_name: true, account_number: true, statement_date: true, file_url: true },
    });

    if (!statement) {
      return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dateStr = statement.statement_date ? statement.statement_date.toISOString().split('T')[0] : 'unknown';
    const driveFilename = `BANK_${statement.bank_name}_${statement.account_number ?? 'NA'}_${dateStr}.pdf`;
    const { fileId } = await uploadToDrive(buffer, driveFilename, 'application/pdf');
    const fileUrl = getDriveViewUrl(fileId);

    await prisma.bankStatement.update({
      where: { id: statementId },
      data: { file_url: fileUrl },
    });

    return NextResponse.json({ data: { file_url: fileUrl }, error: null });
  } catch (err) {
    console.error('Reupload PDF error:', err);
    return NextResponse.json({ data: null, error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
