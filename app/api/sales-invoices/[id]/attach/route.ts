import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { uploadFileForFirm } from '@/lib/google-drive';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/sales-invoices/[id]/attach
 * Attach a document to an existing official receipt (OR-) sales invoice.
 * Uploads file to Google Drive, updates record. No OCR needed for OR records.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const salesInvoice = await prisma.salesInvoice.findUnique({ where: { id } });
  if (!salesInvoice) {
    return NextResponse.json({ data: null, error: 'Sales invoice not found' }, { status: 404 });
  }

  // Auth check
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(salesInvoice.firm_id)) {
      return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
    }
  } else if (session.user.firm_id !== salesInvoice.firm_id) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  if (!salesInvoice.invoice_number?.startsWith('OR-')) {
    return NextResponse.json({ data: null, error: 'Only official receipts (OR-) can have documents attached' }, { status: 400 });
  }
  if (salesInvoice.file_url) {
    return NextResponse.json({ data: null, error: 'This record already has a document attached' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  // Upload to Google Drive
  const firm = await prisma.firm.findUnique({ where: { id: salesInvoice.firm_id }, select: { name: true } });
  let fileUrl: string | null = null;
  let fileDownloadUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const uploaded = await uploadFileForFirm(file, salesInvoice.firm_id, firm?.name ?? 'Unknown', 'invoices');
    fileUrl = uploaded.fileUrl;
    fileDownloadUrl = uploaded.downloadUrl;
    thumbnailUrl = uploaded.thumbnailUrl;
  } catch (err) {
    console.error('Google Drive upload failed:', err);
    return NextResponse.json({ data: null, error: 'Failed to upload file to Google Drive' }, { status: 500 });
  }

  await prisma.salesInvoice.update({
    where: { id },
    data: {
      file_url: fileUrl,
      file_download_url: fileDownloadUrl,
      thumbnail_url: thumbnailUrl,
      file_hash: fileHash,
    },
  });

  return NextResponse.json({ data: { success: true, warnings: [], file_url: fileUrl, thumbnail_url: thumbnailUrl }, error: null });
}
