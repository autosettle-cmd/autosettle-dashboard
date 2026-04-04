import { NextRequest, NextResponse } from "next/server";
import { runOCR, normaliseOCRText } from "@/lib/whatsapp/ocr";
import {
  extractWithGemini,
  extractWithGeminiInvoice,
  extractInvoiceFromPDF,
  classifyDocument,
} from "@/lib/whatsapp/gemini";
import { parseGeminiOutput, parseGeminiInvoiceOutput } from "@/lib/whatsapp/parser";

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

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const categories = categoriesRaw
      ? JSON.parse(categoriesRaw) as string[]
      : [];

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPDF) {
      // PDF → send directly to Gemini (native PDF reading)
      const { documentType, raw } = await extractInvoiceFromPDF(buffer, categories);

      if (documentType === "bank_statement") {
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
      const fields = parseGeminiOutput(raw);
      return NextResponse.json({ documentType: "receipt", fields });
    }

    // Image → Google Vision OCR → classify → extract
    const rawText = await runOCR(buffer);
    const normalised = normaliseOCRText(rawText);
    const documentType = await classifyDocument(normalised);

    if (documentType === "invoice") {
      const geminiRaw = await extractWithGeminiInvoice(normalised, categories);
      const fields = parseGeminiInvoiceOutput(geminiRaw);
      return NextResponse.json({ documentType: "invoice", fields });
    }

    // Receipt
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
