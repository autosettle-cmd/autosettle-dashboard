import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert");
import { runOCR, normaliseOCRText } from "@/lib/whatsapp/ocr";
import {
  countReceiptsInImage,
  extractFromImage,
  extractWithGemini,
  extractWithGeminiInvoice,
  extractInvoiceFromPDF,
  classifyDocument,
  classifyPDF,
  classifyImage,
} from "@/lib/whatsapp/gemini";
import { parseGeminiOutput, parseGeminiOutputMultiple, parseGeminiInvoiceOutput } from "@/lib/whatsapp/parser";
import { prisma } from "@/lib/prisma";
import { InvoiceDocType } from "@/lib/whatsapp/gemini";

export const dynamic = 'force-dynamic';

/**
 * Check if detected document type is wrong for the upload context.
 * Returns error message if blocked, null if allowed.
 *
 * | Context     | Accept           | Block                    |
 * |-------------|------------------|--------------------------|
 * | "claim"     | receipt          | bank_statement, invoice  |
 * | "invoice"   | invoice, receipt | bank_statement           |
 * | null        | invoice, receipt | bank_statement           |
 */
function getDocTypeBlockError(detectedType: string, _context: string | null): string | null {
  if (detectedType === 'bank_statement') {
    return 'This is a bank statement. Please upload it on the Bank Recon page instead.';
  }
  return null;
}

/**
 * Layer 2: Supplier cross-check — structural signal overrides Gemini guess.
 * If vendor matches an existing supplier → lean PI/CN.
 * If vendor matches the firm name → lean SI/DN.
 */
function applySupplierCrossCheck(
  geminiDocType: InvoiceDocType,
  vendor: string,
  firmName: string,
  supplierNames: string[]
): InvoiceDocType {
  if (!vendor || !firmName) return geminiDocType;

  const vendorLower = vendor.toLowerCase().trim();
  const firmLower = firmName.toLowerCase().trim();

  // Fuzzy match: check if vendor name overlaps significantly with firm name
  const firmWords = firmLower.split(/\s+/).filter(w => w.length > 2 && !['sdn', 'bhd', 'plt', 'inc', 'llc', 'co', 'the'].includes(w));
  const vendorWords = vendorLower.split(/\s+/).filter(w => w.length > 2 && !['sdn', 'bhd', 'plt', 'inc', 'llc', 'co', 'the'].includes(w));

  const firmMatchesVendor = firmWords.length > 0 && firmWords.every(w => vendorLower.includes(w));
  const vendorMatchesFirm = vendorWords.length > 0 && vendorWords.every(w => firmLower.includes(w));
  const isFirmAsVendor = firmMatchesVendor || vendorMatchesFirm;

  // If vendor IS the firm → this is an outgoing doc (SI/DN)
  if (isFirmAsVendor) {
    if (geminiDocType === 'PI') return 'SI';
    if (geminiDocType === 'CN') return 'DN'; // firm issued a credit note = debit note
    return geminiDocType; // already SI/DN/PV/OR
  }

  // If vendor matches a known supplier → this is an incoming doc (PI/CN)
  const matchesSupplier = supplierNames.some(sn => {
    const snLower = sn.toLowerCase().trim();
    return vendorLower.includes(snLower) || snLower.includes(vendorLower);
  });
  if (matchesSupplier) {
    if (geminiDocType === 'SI') return 'PI';
    if (geminiDocType === 'DN') return 'CN';
    return geminiDocType; // already PI/CN/PV/OR
  }

  return geminiDocType;
}

/**
 * POST /api/ocr/extract
 * Accepts a file upload (image or PDF) + optional categories list.
 * Returns extracted fields for auto-filling claim or invoice forms.
 */
export async function POST(req: NextRequest) {
  const startMs = Date.now();
  let _fileName = 'unknown';
  let _firmId: string | null = null;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const categoriesRaw = formData.get("categories") as string | null;
    const context = formData.get("context") as string | null; // "claim" or "invoice" — skips bank_statement classification
    const firmId = formData.get("firm_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    _fileName = file.name;
    _firmId = firmId;

    const categories = categoriesRaw
      ? JSON.parse(categoriesRaw) as string[]
      : [];

    // Look up firm name + existing suppliers for doc type detection (Layers 1 & 2)
    let firmName = '';
    let supplierNames: string[] = [];
    if (firmId) {
      const [firm, suppliers] = await Promise.all([
        prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
        prisma.supplier.findMany({ where: { firm_id: firmId }, select: { name: true } }),
      ]);
      firmName = firm?.name ?? '';
      supplierNames = suppliers.map(s => s.name);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buffer: Buffer = Buffer.from(await file.arrayBuffer()) as any;
    const fileName = file.name.toLowerCase();
    const isPDF = file.type === "application/pdf" || fileName.endsWith(".pdf");

    // Convert HEIC/HEIF to JPEG for OCR compatibility
    const isHEIC = fileName.endsWith(".heic") || fileName.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
    if (isHEIC) {
      console.error('[OCR] Converting HEIC:', { fileName, type: file.type, size: buffer.length });
      try {
        const result = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
        buffer = Buffer.from(result);
        console.error('[OCR] HEIC converted to JPEG, new size:', buffer.length);
      } catch (err) {
        console.error('[OCR] HEIC conversion failed:', err);
        return NextResponse.json({ error: 'Failed to convert HEIC image. Try converting to JPEG first.' }, { status: 400 });
      }
    }

    if (isPDF) {
      // Step 1: Quick classification — block wrong document types early
      const pdfType = await classifyPDF(buffer);
      console.error('[OCR classify] PDF type:', pdfType, 'context:', context, 'file:', file.name);
      const blockError = getDocTypeBlockError(pdfType, context);
      if (blockError) {
        return NextResponse.json({ error: blockError }, { status: 400 });
      }

      // Step 2: Full extraction (classification passed)
      const { documentType, raw } = await extractInvoiceFromPDF(buffer, categories, firmName);

      // Double-check: full extraction may also detect bank_statement
      const fullBlockError = getDocTypeBlockError(documentType, context);
      if (fullBlockError) {
        return NextResponse.json({ error: fullBlockError }, { status: 400 });
      }

      if (documentType === "invoice") {
        const fields = parseGeminiInvoiceOutput(raw);
        const docType = applySupplierCrossCheck(fields.docType, fields.vendor, firmName, supplierNames);
        return NextResponse.json({ documentType: "invoice", docType, fields: { ...fields, docType } });
      }

      // Receipt
      const allFields = parseGeminiOutputMultiple(raw);
      return NextResponse.json({ documentType: "receipt", fields: allFields[0] });
    }

    // Step 1: Quick classification for images — block wrong document types early
    const mimeType = isHEIC ? "image/jpeg" : file.type || "image/jpeg";
    const imgType = await classifyImage(buffer, mimeType);
    const imgBlockError = getDocTypeBlockError(imgType, context);
    if (imgBlockError) {
      return NextResponse.json({ error: imgBlockError }, { status: 400 });
    }

    // Step 2: Quick multimodal count — how many receipts in the image?
    const receiptCount = await countReceiptsInImage(buffer, mimeType);

    if (receiptCount > 1) {
      // Multiple receipts → Gemini multimodal extraction (spatial layout needed)
      const geminiRaw = await extractFromImage(buffer, mimeType, categories);
      const allReceipts = parseGeminiOutputMultiple(geminiRaw);

      return NextResponse.json({
        documentType: "receipt",
        multipleReceipts: true,
        receipts: allReceipts,
        fields: allReceipts[0],
      });
    }

    // Single receipt → Vision OCR + Gemini text (most accurate)
    const rawText = await runOCR(buffer);
    const normalised = normaliseOCRText(rawText);
    const documentType = await classifyDocument(normalised);

    if (documentType === "invoice") {
      const geminiRaw = await extractWithGeminiInvoice(normalised, categories, firmName);
      const fields = parseGeminiInvoiceOutput(geminiRaw);
      const docType = applySupplierCrossCheck(fields.docType, fields.vendor, firmName, supplierNames);
      return NextResponse.json({ documentType: "invoice", docType, fields: { ...fields, docType } });
    }

    const geminiRaw = await extractWithGemini(normalised, categories);
    const fields = parseGeminiOutput(geminiRaw);
    // Log success
    prisma.ocrLog.create({ data: { firm_id: firmId, file_name: file.name, document_type: 'receipt', confidence: fields?.confidence, success: true, processing_ms: Date.now() - startMs, source: 'dashboard_upload' } }).catch(() => {});
    return NextResponse.json({ documentType: "receipt", fields });
  } catch (err) {
    console.error("[OCR extract] Error:", err);
    // Log failure
    prisma.ocrLog.create({ data: { firm_id: _firmId, file_name: _fileName, document_type: 'unknown', success: false, error_message: err instanceof Error ? err.message : String(err), processing_ms: Date.now() - startMs, source: 'dashboard_upload' } }).catch(() => {});
    return NextResponse.json(
      { error: "OCR extraction failed. Please fill in the fields manually." },
      { status: 500 }
    );
  }
}
