import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { uploadFileForFirm } from '@/lib/google-drive';
import { extractInvoiceFromPDF, extractWithGeminiInvoice } from '@/lib/whatsapp/gemini';
import { runOCR, normaliseOCRText } from '@/lib/whatsapp/ocr';
import { parseGeminiInvoiceOutput } from '@/lib/whatsapp/parser';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/invoices/[id]/attach
 * Attach a document to an existing payment voucher (PV-) invoice.
 * Uploads file to Google Drive, runs OCR, warns on mismatches, updates invoice record.
 * No new JV is created — the PV's existing JV stays as-is.
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

  // Load invoice
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  // Auth check
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(invoice.firm_id)) {
      return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
    }
  } else if (session.user.firm_id !== invoice.firm_id) {
    return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
  }

  // Must be a PV or OR with no file
  const isPVorOR = invoice.invoice_number?.startsWith('PV-') || invoice.invoice_number?.startsWith('OR-');
  if (!isPVorOR) {
    return NextResponse.json({ data: null, error: 'Only payment vouchers (PV-) and official receipts (OR-) can have documents attached' }, { status: 400 });
  }
  if (invoice.file_url) {
    return NextResponse.json({ data: null, error: 'This invoice already has a document attached' }, { status: 400 });
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
  }
  const isGenerated = formData.get('generated') === 'true'; // skip OCR for system-generated PDFs

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  const isPDF = file.type === 'application/pdf' || fileName.endsWith('.pdf');

  // Dedup check (skip for system-generated PDFs)
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  if (!isGenerated) {
    const hashDupe = await prisma.invoice.findFirst({
      where: { firm_id: invoice.firm_id, file_hash: fileHash },
      select: { id: true, vendor_name_raw: true, invoice_number: true },
    });
    if (hashDupe) {
      return NextResponse.json(
        { data: null, error: `Duplicate file: this document was already uploaded${hashDupe.invoice_number ? ` as ${hashDupe.invoice_number}` : ''} (${hashDupe.vendor_name_raw})` },
        { status: 409 }
      );
    }
  }

  // Upload to Google Drive
  const firm = await prisma.firm.findUnique({ where: { id: invoice.firm_id }, select: { name: true } });
  let fileUrl: string | null = null;
  let fileDownloadUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const uploaded = await uploadFileForFirm(file, invoice.firm_id, firm?.name ?? 'Unknown', 'invoices');
    fileUrl = uploaded.fileUrl;
    fileDownloadUrl = uploaded.downloadUrl;
    thumbnailUrl = uploaded.thumbnailUrl;
  } catch (err) {
    console.error('Google Drive upload failed:', err);
    return NextResponse.json({ data: null, error: 'Failed to upload file to Google Drive' }, { status: 500 });
  }

  // OCR extraction (skip for system-generated voucher PDFs)
  const warnings: string[] = [];
  let ocrInvoiceNumber: string | null = null;

  if (isGenerated) {
    // No OCR needed — this is a system-generated voucher PDF
  } else try {
    // Get categories for OCR context
    const categories = await prisma.category.findMany({ select: { name: true } });
    const categoryNames = categories.map(c => c.name);

    let ocrResult: { vendor?: string; totalAmount?: number; invoiceNumber?: string } | null = null;

    if (isPDF) {
      const { raw } = await extractInvoiceFromPDF(buffer, categoryNames);
      ocrResult = parseGeminiInvoiceOutput(raw);
    } else {
      // Image — use Vision OCR + Gemini for single images
      const rawText = await runOCR(buffer);
      const normalised = normaliseOCRText(rawText);
      const geminiRaw = await extractWithGeminiInvoice(normalised, categoryNames);
      ocrResult = parseGeminiInvoiceOutput(geminiRaw);
    }

    if (ocrResult) {
      // Compare amount
      const invoiceAmount = Number(invoice.total_amount);
      if (ocrResult.totalAmount && Math.abs(ocrResult.totalAmount - invoiceAmount) > 0.01) {
        warnings.push(
          `OCR amount RM ${ocrResult.totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} differs from recorded RM ${invoiceAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
        );
      }

      // Compare vendor
      if (ocrResult.vendor && ocrResult.vendor.toLowerCase() !== invoice.vendor_name_raw.toLowerCase()) {
        warnings.push(
          `OCR vendor "${ocrResult.vendor}" differs from recorded "${invoice.vendor_name_raw}"`
        );
      }

      // Extract real invoice number
      if (ocrResult.invoiceNumber) {
        ocrInvoiceNumber = ocrResult.invoiceNumber;
      }
    }
  } catch (err) {
    console.warn('OCR extraction failed during attach, continuing with file only:', err);
    warnings.push('OCR extraction failed — document attached without verification');
  }

  // Update invoice record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    file_url: fileUrl,
    file_download_url: fileDownloadUrl,
    thumbnail_url: thumbnailUrl,
    file_hash: fileHash,
  };

  // Update invoice number from PV-XXX to real number if OCR found one
  if (ocrInvoiceNumber) {
    updateData.invoice_number = ocrInvoiceNumber;
  }

  await prisma.invoice.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({
    data: {
      success: true,
      warnings,
      invoice_number: ocrInvoiceNumber || invoice.invoice_number,
    },
    error: null,
  });
}
