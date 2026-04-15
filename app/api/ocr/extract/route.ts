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
} from "@/lib/whatsapp/gemini";
import { parseGeminiOutput, parseGeminiOutputMultiple, parseGeminiInvoiceOutput } from "@/lib/whatsapp/parser";

export const dynamic = 'force-dynamic';

/**
 * POST /api/ocr/extract
 * Accepts a file upload (image or PDF) + optional categories list.
 * Returns extracted fields for auto-filling claim or invoice forms.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const categoriesRaw = formData.get("categories") as string | null;
    const context = formData.get("context") as string | null; // "claim" or "invoice" — skips bank_statement classification

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const categories = categoriesRaw
      ? JSON.parse(categoriesRaw) as string[]
      : [];

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
      // PDF → send directly to Gemini (native PDF reading)
      const { documentType, raw } = await extractInvoiceFromPDF(buffer, categories);

      if (documentType === "bank_statement") {
        if (context === "claim") {
          // Claims context: force re-extract as receipt (bank transfer receipts)
          const mimeType = "application/pdf";
          const receiptRaw = await extractFromImage(buffer, mimeType, categories);
          const fields = parseGeminiOutputMultiple(receiptRaw);
          return NextResponse.json({ documentType: "receipt", fields: fields[0] });
        }
        return NextResponse.json({
          documentType: "bank_statement",
          fields: null,
          message: "This appears to be a bank statement, not a receipt or invoice.",
        });
      }

      if (documentType === "invoice") {
        const fields = parseGeminiInvoiceOutput(raw);
        return NextResponse.json({ documentType: "invoice", fields });
      }

      // Receipt
      const allFields = parseGeminiOutputMultiple(raw);
      return NextResponse.json({ documentType: "receipt", fields: allFields[0] });
    }

    // Step 1: Quick multimodal count — how many receipts in the image?
    const mimeType = isHEIC ? "image/jpeg" : file.type || "image/jpeg";
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
      const geminiRaw = await extractWithGeminiInvoice(normalised, categories);
      const fields = parseGeminiInvoiceOutput(geminiRaw);
      return NextResponse.json({ documentType: "invoice", fields });
    }

    const geminiRaw = await extractWithGemini(normalised, categories);
    const fields = parseGeminiOutput(geminiRaw);
    return NextResponse.json({ documentType: "receipt", fields });
  } catch (err) {
    console.error("[OCR extract] Error:", err);
    return NextResponse.json(
      { error: "OCR extraction failed. Please fill in the fields manually." },
      { status: 500 }
    );
  }
}
