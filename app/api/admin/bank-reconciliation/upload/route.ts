import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseBankStatementPDF } from '@/lib/bank-pdf-parser';
import { classifyPDF } from '@/lib/whatsapp/gemini';
import { autoMatchTransactions } from '@/lib/bank-reconciliation';
import { deduplicateTransactions, findOverlappingStatements, computePeriodRange } from '@/lib/bank-dedup';
import { uploadToDriveForFirm, getDriveViewUrl } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

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

  const buffer = Buffer.from(await file.arrayBuffer());

  // Quick classification — block non-bank-statement documents
  const pdfType = await classifyPDF(buffer);
  if (pdfType !== 'bank_statement') {
    const typeLabel = pdfType === 'invoice' ? 'an invoice' : 'a receipt';
    return NextResponse.json({ data: null, error: `This looks like ${typeLabel}, not a bank statement. Please upload it on the ${pdfType === 'invoice' ? 'Invoices' : 'Receipts'} page instead.` }, { status: 400 });
  }

  let result;
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
    const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
    const dateStr = result.statementDate ? result.statementDate.toISOString().split('T')[0] : 'unknown';
    const driveFilename = `BANK_${result.bankName}_${result.accountNumber ?? 'NA'}_${dateStr}.pdf`;
    const { fileId } = await uploadToDriveForFirm(buffer, driveFilename, 'application/pdf', firmId, firm.name, 'bank_statements');
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

  // Deduplicate transactions against existing ones for the same bank account
  const period = computePeriodRange(result.transactions);
  const dedup = await deduplicateTransactions(firmId, result.accountNumber, result.transactions);
  const overlappingStmts = period
    ? await findOverlappingStatements(firmId, result.accountNumber, period.periodStart, period.periodEnd)
    : [];

  // Create statement and transactions (only non-duplicates)
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
      period_start: period?.periodStart,
      period_end: period?.periodEnd,
      transactions: {
        create: dedup.unique.map((t) => ({
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

  // Run auto-matching only if there are new transactions
  const matchResult = dedup.unique.length > 0
    ? await autoMatchTransactions(firmId, statement.id)
    : { matched: 0, unmatched: 0 };

  return NextResponse.json({
    data: {
      statementId: statement.id,
      bankName: bankName || result.bankName,
      accountNumber: result.accountNumber,
      statementDate: result.statementDate,
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
      transactionCount: dedup.unique.length,
      skippedDuplicates: dedup.duplicates.length,
      totalParsed: result.transactions.length,
      overlappingStatements: overlappingStmts.map((s) => ({ id: s.id, fileName: s.file_name })),
      matched: matchResult.matched,
      unmatched: matchResult.unmatched,
      errors: result.errors,
      warning: result.usedGeminiFallback ? 'Regex parser failed — transactions extracted via Gemini AI. Please verify accuracy and send the PDF to dev for a fixed regex parser.' : undefined,
    },
    error: null,
  });
  } catch (err) {
    console.error('Upload route error:', err);
    return NextResponse.json({ data: null, error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
