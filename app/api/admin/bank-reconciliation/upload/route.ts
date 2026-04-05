import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseBankStatementPDF } from '@/lib/bank-pdf-parser';
import { autoMatchTransactions } from '@/lib/bank-reconciliation';
import { uploadToDrive, getDriveViewUrl } from '@/lib/whatsapp/drive';

export async function POST(request: NextRequest) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const bankName = formData.get('bank_name') as string | null;
  const password = formData.get('password') as string | null;

  if (!file) {
    return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
  }

  if (!file.type.includes('pdf')) {
    return NextResponse.json({ data: null, error: 'File must be a PDF' }, { status: 400 });
  }

  let result;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    result = await parseBankStatementPDF(buffer, password || undefined);
  } catch (e) {
    console.error('PDF parse error:', e);
    return NextResponse.json({ data: null, error: `PDF parsing failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  if (result.errors.length > 0 && result.transactions.length === 0) {
    const isPasswordRequired = result.errors.includes('PASSWORD_REQUIRED');
    return NextResponse.json(
      { data: null, error: isPasswordRequired ? 'PASSWORD_REQUIRED' : result.errors.join('; ') },
      { status: isPasswordRequired ? 422 : 400 },
    );
  }

  // Upload to Google Drive
  let fileUrl: string | null = null;
  try {
    const dateStr = result.statementDate ? result.statementDate.toISOString().split('T')[0] : 'unknown';
    const driveFilename = `BANK_${result.bankName}_${result.accountNumber ?? 'NA'}_${dateStr}.pdf`;
    const { fileId } = await uploadToDrive(buffer, driveFilename, 'application/pdf');
    fileUrl = getDriveViewUrl(fileId);
  } catch (e) {
    console.error('Drive upload failed (non-blocking):', e);
  }

  // Check for duplicate upload
  const existing = await prisma.bankStatement.findUnique({
    where: { file_hash: result.fileHash },
  });
  if (existing) {
    return NextResponse.json({
      data: null,
      error: 'This statement has already been uploaded',
    }, { status: 409 });
  }

  // Create statement and transactions
  const statement = await prisma.bankStatement.create({
    data: {
      firm_id: firmId,
      bank_name: bankName || result.bankName,
      account_number: result.accountNumber,
      statement_date: result.statementDate ?? new Date(),
      opening_balance: result.openingBalance,
      closing_balance: result.closingBalance,
      file_name: file.name,
      file_hash: result.fileHash,
      file_url: fileUrl,
      uploaded_by: session.user.id,
      transactions: {
        create: result.transactions.map((t) => ({
          transaction_date: t.transactionDate,
          description: t.description,
          reference: t.reference,
          cheque_number: t.chequeNumber,
          debit: t.debit,
          credit: t.credit,
          balance: t.balance,
        })),
      },
    },
  });

  // Run auto-matching
  const matchResult = await autoMatchTransactions(firmId, statement.id);

  return NextResponse.json({
    data: {
      statementId: statement.id,
      bankName: bankName || result.bankName,
      accountNumber: result.accountNumber,
      statementDate: result.statementDate,
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
      transactionCount: result.transactions.length,
      matched: matchResult.matched,
      unmatched: matchResult.unmatched,
      errors: result.errors,
    },
    error: null,
  });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ data: null, error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
