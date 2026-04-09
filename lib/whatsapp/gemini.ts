import { GoogleAuth } from "google-auth-library";
import { parseServiceAccountCredentials } from "@/lib/google-drive";

export interface GeminiExtractionResult {
  date: string;
  merchant: string;
  amount: number;
  receiptNumber: string;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface GeminiInvoiceResult {
  vendor: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export type DocumentType = "receipt" | "invoice" | "bank_statement";

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    const credentials = parseServiceAccountCredentials();
    authClient = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return authClient;
}

/**
 * Send normalised OCR text to Gemini (Vertex AI) for structured extraction.
 */
export async function extractWithGemini(
  ocrText: string,
  categories: string[]
): Promise<string> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const systemPrompt = `You are an expert receipt parser for Malaysian SME expense claims.
Extract the following fields from the receipt OCR text.
Return ONLY valid JSON, no explanation, no markdown.

Fields to extract:
- date: receipt date in YYYY-MM-DD format
- merchant: creditor/supplier name
- amount: total amount as a number (RM, no currency symbol)
- receiptNumber: invoice or receipt number (empty string if not found)
- category: pick the BEST match from this list only: [${categories.join(", ")}]
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: date, merchant, amount all clearly extracted
- MEDIUM: all fields found but some ambiguity
- LOW: one or more key fields missing or unclear

Return format:
{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "confidence": "HIGH"}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: ocrText }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${errText}`);
  }

  const json = await res.json();

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }

  return text;
}

/**
 * Classify document type from OCR text — receipt or invoice.
 */
export async function classifyDocument(ocrText: string): Promise<DocumentType> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const systemPrompt = `You are a document classifier for Malaysian business documents.
Classify the following OCR text as either "receipt" or "invoice".

Rules:
- "invoice": contains invoice number, payment terms, due date, bill-to/ship-to, or is clearly a bill requesting payment
- "receipt": proof of payment, transaction record, POS receipt, or acknowledgment of payment made

Return ONLY one word: receipt or invoice`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: ocrText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 16,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) return "receipt"; // fallback to receipt on error

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() ?? "";
  return text === "invoice" ? "invoice" : "receipt";
}

/**
 * Extract invoice fields from OCR text via Gemini.
 */
export async function extractWithGeminiInvoice(
  ocrText: string,
  categories: string[]
): Promise<string> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const systemPrompt = `You are an expert invoice parser for Malaysian SME accounts payable.
Extract the following fields from the invoice OCR text.
Return ONLY valid JSON, no explanation, no markdown.

Fields to extract:
- vendor: supplier/vendor/creditor name
- invoiceNumber: invoice or bill number (empty string if not found)
- issueDate: invoice issue date in YYYY-MM-DD format
- dueDate: payment due date in YYYY-MM-DD format. If not explicitly stated but paymentTerms and issueDate are known, CALCULATE it (e.g. issueDate 2026-03-15 + "30 Days" = dueDate 2026-04-14). Empty string only if truly unknown.
- paymentTerms: payment terms like "Net 30", "30 Days", "Net 60", "COD" (empty string if not found)
- subtotal: subtotal before tax as a number (0 if not found)
- taxAmount: tax/GST/SST amount as a number (0 if not found)
- totalAmount: total amount payable as a number (RM, no currency symbol)
- category: pick the BEST match from this list only: [${categories.join(", ")}]
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: vendor, totalAmount, issueDate all clearly extracted
- MEDIUM: all key fields found but some ambiguity
- LOW: one or more key fields missing or unclear

Return format:
{"vendor": "", "invoiceNumber": "", "issueDate": "", "dueDate": "", "paymentTerms": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0, "category": "", "confidence": "HIGH"}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: ocrText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${errText}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");
  return text;
}

/**
 * Send a PDF buffer directly to Gemini for classification + invoice extraction in one call.
 * Skips OCR entirely — Gemini reads the PDF natively.
 */
export async function extractInvoiceFromPDF(
  pdfBuffer: Buffer,
  categories: string[]
): Promise<{ documentType: DocumentType; raw: string }> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const systemPrompt = `You are an expert document parser for Malaysian SME accounting.
Analyze this PDF document and:
1. Classify it as "receipt", "invoice", or "bank_statement"
2. Extract structured data

A BANK STATEMENT is a document from a bank (Maybank, CIMB, Public Bank, RHB, Hong Leong, AmBank, OCBC, UOB, HSBC, Alliance, etc.) showing account transactions with dates, descriptions, debits, credits, and running balances. It has opening/closing balances and is NOT an invoice or receipt. If it is a bank statement, return ONLY: {"documentType": "bank_statement"}

If it is an INVOICE, extract:
- vendor: supplier/vendor name
- invoiceNumber: invoice or bill number (empty string if not found)
- issueDate: issue date in YYYY-MM-DD format
- dueDate: due date in YYYY-MM-DD format. If not explicitly stated but paymentTerms and issueDate are known, CALCULATE it (e.g. issueDate 2026-03-15 + "30 Days" = dueDate 2026-04-14). Empty string only if truly unknown.
- paymentTerms: e.g. "Net 30", "30 Days" (empty string if not found)
- subtotal: subtotal before tax (0 if not found)
- taxAmount: tax/GST/SST amount (0 if not found)
- totalAmount: total payable as number
- category: pick BEST match from: [${categories.join(", ")}]
- confidence: HIGH, MEDIUM, or LOW

If it is a RECEIPT, extract:
- date: date in YYYY-MM-DD format
- merchant: merchant/supplier name
- amount: total amount as number
- receiptNumber: receipt number (empty string if not found)
- category: pick BEST match from: [${categories.join(", ")}]
- confidence: HIGH, MEDIUM, or LOW

Return ONLY valid JSON with a "documentType" field ("receipt" or "invoice") plus the extracted fields.

Invoice format: {"documentType": "invoice", "vendor": "", "invoiceNumber": "", "issueDate": "", "dueDate": "", "paymentTerms": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0, "category": "", "confidence": "HIGH"}

Receipt format: {"documentType": "receipt", "date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "confidence": "HIGH"}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBuffer.toString("base64"),
              },
            },
            { text: "Extract data from this document." },
          ],
        },
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${errText}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");

  // Parse just the documentType to route, return raw for full parsing
  try {
    let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    if (!cleaned.endsWith("}")) cleaned += "}";
    const parsed = JSON.parse(cleaned);
    const documentType: DocumentType = parsed.documentType === "invoice" ? "invoice" : parsed.documentType === "bank_statement" ? "bank_statement" : "receipt";
    return { documentType, raw: text };
  } catch {
    return { documentType: "receipt", raw: text };
  }
}
