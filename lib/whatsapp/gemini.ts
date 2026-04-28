import { GoogleAuth } from "google-auth-library";
import { parseServiceAccountCredentials } from "@/lib/google-drive";

export interface GeminiExtractionResult {
  date: string;
  merchant: string;
  amount: number;
  receiptNumber: string;
  category: string;
  notes: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export type InvoiceDocType = 'PI' | 'SI' | 'CN' | 'DN' | 'PV' | 'OR';

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
  notes: string;
  docType: InvoiceDocType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  depositWarning?: string;
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

// ─── Resilient Gemini Call Wrapper ────────────────────────────────────────────
// Retry on 500/503/429 with exponential backoff, timeout protection, error detail logging.

const GEMINI_TIMEOUT_MS = 30_000; // 30s per attempt
const GEMINI_MAX_RETRIES = 2;     // up to 3 total attempts

async function getGeminiUrl(): Promise<{ url: string; token: string; useApiKey: boolean }> {
  // Prefer free Google AI Studio API key (no billing required)
  const aiApiKey = process.env.GOOGLE_AI_API_KEY;
  if (aiApiKey) {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiApiKey}`;
    return { url, token: '', useApiKey: true };
  }

  // Fallback to Vertex AI (requires billing)
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const auth = getAuthClient();
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  return { url, token: tokenResult.token!, useApiKey: false };
}

async function geminiCall(
  body: Record<string, unknown>,
  label: string,
): Promise<{ json: Record<string, unknown>; text: string }> {
  const { url, token, useApiKey } = await getGeminiUrl();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!useApiKey) headers["Authorization"] = `Bearer ${token}`;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        const retryable = [429, 500, 502, 503].includes(res.status);
        console.error(`[Gemini ${label}] Attempt ${attempt + 1}/${GEMINI_MAX_RETRIES + 1} failed: ${res.status} — ${errText.slice(0, 200)}`);

        if (retryable && attempt < GEMINI_MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s...
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Gemini API error: ${res.status} — ${errText.slice(0, 300)}`);
      }

      const json = await res.json();
      const candidate = json.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        console.error(`[Gemini ${label}] No text in response:`, JSON.stringify(json).slice(0, 300));
        throw new Error("No response from Gemini");
      }
      return { json, text };
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        console.error(`[Gemini ${label}] Attempt ${attempt + 1} timed out after ${GEMINI_TIMEOUT_MS}ms`);
        if (attempt < GEMINI_MAX_RETRIES) {
          continue;
        }
        throw new Error(`Gemini timed out after ${GEMINI_MAX_RETRIES + 1} attempts (${GEMINI_TIMEOUT_MS}ms each)`);
      }
      throw err;
    }
  }
  throw new Error(`Gemini ${label}: all ${GEMINI_MAX_RETRIES + 1} attempts failed`);
}

/**
 * Send normalised OCR text to Gemini (Vertex AI) for structured extraction.
 */
export async function extractWithGemini(
  ocrText: string,
  categories: string[]
): Promise<string> {
  const systemPrompt = `You are an expert receipt parser for Malaysian SME expense claims.
The OCR text may contain ONE or MULTIPLE receipts. Carefully detect how many separate receipts are present.

Extract the following fields from EACH receipt:
- date: receipt date in YYYY-MM-DD format
- merchant: the actual payee/recipient of the payment, NOT the banking platform. For bank transfer receipts (Maybank2u, CIMB Clicks, DuitNow, FPX, etc.), use the "Transfer To" / "Recipient" / "Beneficiary" name as the merchant. For regular purchase receipts, use the store/shop name.
- amount: total amount as a number (RM, no currency symbol)
- receiptNumber: invoice or receipt number (empty string if not found)
- category: pick the BEST match from this list only: [${categories.join(", ")}]. Base the category on the PURPOSE of the transaction (what was paid for), not the banking platform or payment method. For bank transfers, infer the category from the recipient name and context (e.g. paying "NINJA LOGISTICS" = Logistics/Delivery, not "Bank & Finance").
- notes: important extra details the accountant should know — e.g. "Billed To" / "Bill To" person name, phone/account numbers, service period, account holder name, what was purchased. ALWAYS include the "Billed To" or "Bill To" name if present. Keep concise (2-3 lines max). Empty string if nothing notable.
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: date, merchant, amount all clearly extracted
- MEDIUM: all fields found but some ambiguity
- LOW: one or more key fields missing or unclear

If there is only ONE receipt, return a single JSON object:
{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "notes": "", "confidence": "HIGH"}

If there are MULTIPLE receipts, return a JSON array:
[{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "notes": "", "confidence": "HIGH"}, ...]

Return ONLY valid JSON, no explanation, no markdown.`;

  const { text } = await geminiCall({
    contents: [{ role: "user", parts: [{ text: ocrText }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  }, 'extractWithGemini');

  return text;
}

/**
 * Quick multimodal check: how many receipts are visible in the image?
 * Returns a number (1 if unsure).
 */
export async function countReceiptsInImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<number> {
  try {
    const { text } = await geminiCall({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBuffer.toString("base64") } },
          { text: "How many separate receipts, invoices, or bills are visible in this image? Return ONLY a single number, nothing else." },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
    }, 'countReceipts');
    const num = parseInt(text.trim(), 10);
    return isNaN(num) || num < 1 ? 1 : num;
  } catch {
    return 1; // Default to 1 on failure
  }
}

/**
 * Send image directly to Gemini (multimodal) for structured extraction.
 * Used for multi-receipt images where OCR text would be jumbled.
 */
export async function extractFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  categories: string[]
): Promise<string> {
  const systemPrompt = `You are an expert receipt parser for Malaysian SME expense claims.
This image may contain ONE or MULTIPLE receipts. Look at the image carefully and detect how many separate receipts are visible.

Extract the following fields from EACH receipt:
- date: receipt date in YYYY-MM-DD format
- merchant: the actual payee/recipient of the payment, NOT the banking platform. For bank transfer receipts (Maybank2u, CIMB Clicks, DuitNow, FPX, etc.), use the "Transfer To" / "Recipient" / "Beneficiary" name as the merchant. For regular purchase receipts, use the store/shop name.
- amount: total amount as a number (RM, no currency symbol)
- receiptNumber: invoice or receipt number (empty string if not found)
- category: pick the BEST match from this list only: [${categories.join(", ")}]. Base the category on the PURPOSE of the transaction (what was paid for), not the banking platform or payment method. For bank transfers, infer the category from the recipient name and context (e.g. paying "NINJA LOGISTICS" = Logistics/Delivery, not "Bank & Finance").
- notes: important extra details the accountant should know — e.g. "Billed To" / "Bill To" person name, phone/account numbers, service period, account holder name, what was purchased. ALWAYS include the "Billed To" or "Bill To" name if present. Keep concise (2-3 lines max). Empty string if nothing notable.
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: date, merchant, amount all clearly extracted
- MEDIUM: all fields found but some ambiguity
- LOW: one or more key fields missing or unclear

If there is only ONE receipt, return a single JSON object:
{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "notes": "", "confidence": "HIGH"}

If there are MULTIPLE receipts, return a JSON array:
[{"date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "notes": "", "confidence": "HIGH"}, ...]

Return ONLY valid JSON, no explanation, no markdown.`;

  const { text } = await geminiCall({
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBuffer.toString("base64") } },
        { text: "Extract receipt data from this image." },
      ],
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  }, 'extractFromImage');

  return text;
}

/**
 * Classify document type from OCR text — receipt or invoice.
 */
export async function classifyDocument(ocrText: string): Promise<DocumentType> {
  try {
    const { text } = await geminiCall({
      contents: [{ role: "user", parts: [{ text: ocrText }] }],
      systemInstruction: { parts: [{ text: `You are a document classifier for Malaysian business documents.
Classify the following OCR text as either "receipt" or "invoice".

Rules:
- "invoice": contains invoice number, payment terms, due date, bill-to/ship-to, or is clearly a bill requesting payment
- "receipt": proof of payment, transaction record, POS receipt, or acknowledgment of payment made

Return ONLY one word: receipt or invoice` }] },
      generationConfig: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
    }, 'classifyDocument');
    return text.trim().toLowerCase() === "invoice" ? "invoice" : "receipt";
  } catch {
    return "receipt";
  }
}

const CLASSIFY_PROMPT = `Classify this document as one of: "bank_statement", "invoice", or "receipt".

A BANK STATEMENT is from a bank (Maybank, CIMB, OCBC, Public Bank, RHB, Hong Leong, AmBank, UOB, HSBC, etc.) showing multiple transactions over a date range with columns like Date, Description, Debit/Credit, Balance. Has opening/closing balances, account number, bank letterhead.

An INVOICE is a bill requesting payment — has invoice number, vendor name, line items, total amount, payment terms.

A RECEIPT is proof of a single payment — bank transfer confirmation, POS receipt, payment acknowledgment.

Return ONLY one word: bank_statement, invoice, or receipt`;

function parseClassifyResult(text: string): DocumentType {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z_]/g, '');
  if (cleaned === 'bank_statement') return 'bank_statement';
  if (cleaned === 'invoice') return 'invoice';
  return 'receipt';
}

/**
 * Quick image classification — cheap Gemini call to check document type before full extraction.
 */
export async function classifyImage(imageBuffer: Buffer, mimeType: string): Promise<DocumentType> {
  try {
    const { text } = await geminiCall({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
          { text: "What type of document is this?" },
        ],
      }],
      systemInstruction: { parts: [{ text: CLASSIFY_PROMPT }] },
      generationConfig: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
    }, 'classifyImage');
    return parseClassifyResult(text);
  } catch {
    return 'receipt';
  }
}

/**
 * Quick PDF classification — cheap Gemini call to check document type before full extraction.
 */
export async function classifyPDF(pdfBuffer: Buffer): Promise<DocumentType> {
  try {
    const { text } = await geminiCall({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
          { text: "What type of document is this?" },
        ],
      }],
      systemInstruction: { parts: [{ text: CLASSIFY_PROMPT }] },
      generationConfig: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
    }, 'classifyPDF');
    console.error('[classifyPDF] raw response:', JSON.stringify(text), '→ parsed:', parseClassifyResult(text));
    return parseClassifyResult(text);
  } catch (err) {
    console.error('[classifyPDF] error:', err);
    return 'receipt';
  }
}

/**
 * Extract invoice fields from OCR text via Gemini.
 */
export async function extractWithGeminiInvoice(
  ocrText: string,
  categories: string[],
  firmName?: string
): Promise<string> {
  const firmHint = firmName ? `\nThe uploading accounting firm is: "${firmName}". Use this to determine document direction (who is the buyer vs seller).` : '';
  const systemPrompt = `You are an expert invoice parser for Malaysian SME accounts payable.
Extract the following fields from the invoice OCR text.
Return ONLY valid JSON, no explanation, no markdown.
${firmHint}

Fields to extract:
- vendor: supplier/vendor/creditor name (for PI/CN/PV) or customer/buyer name (for SI/DN/OR)
- invoiceNumber: invoice or bill number (empty string if not found)
- issueDate: invoice issue date in YYYY-MM-DD format
- dueDate: payment due date in YYYY-MM-DD format. If not explicitly stated but paymentTerms and issueDate are known, CALCULATE it (e.g. issueDate 2026-03-15 + "30 Days" = dueDate 2026-04-14). Empty string only if truly unknown.
- paymentTerms: payment terms like "Net 30", "30 Days", "Net 60", "COD" (empty string if not found)
- subtotal: subtotal before tax as a number (0 if not found)
- taxAmount: tax/GST/SST amount as a number (0 if not found)
- totalAmount: total amount payable as a number (RM, no currency symbol). Use the printed total on the invoice as-is. If there are deposit deductions shown, they are already reflected in the total — do not add them back. Mention any deposit deductions in notes for reference. Use NEGATIVE for credit notes.
- category: pick the BEST match from this list only: [${categories.join(", ")}]. Base the category on the PURPOSE of the transaction (what was paid for), not the banking platform or payment method. For bank transfers, infer the category from the recipient name and context (e.g. paying "NINJA LOGISTICS" = Logistics/Delivery, not "Bank & Finance").
- notes: important extra details the accountant should know — e.g. "Billed To" / "Bill To" person name, phone/account numbers, service period, line item summary, account holder name, reference numbers. ALWAYS include the "Billed To" or "Bill To" name if present. If there is a deposit deduction, note the deposit amount and any referenced invoice number. For credit notes, prefix with "CREDIT NOTE: ". For debit notes, prefix with "DEBIT NOTE: ". Keep it concise (2-3 lines max). Empty string if nothing notable.
- docType: document type classification. One of: PI, SI, CN, DN, PV, OR.
  - PI (Purchase Invoice): bill FROM a supplier TO the firm — firm owes money (amounts positive)
  - SI (Sales Invoice): bill FROM the firm TO a customer — customer owes money (amounts positive)
  - CN (Credit Note): supplier reduces what the firm owes — refund/adjustment (negative amounts, or document says "Credit Note"/"CN")
  - DN (Debit Note): firm adds charges to a customer — additional billing (firm is seller, document says "Debit Note"/"DN")
  - PV (Payment Voucher): proof of payment made by the firm
  - OR (Official Receipt): proof of payment received by the firm
  Default to PI if unclear.
- confidence: HIGH, MEDIUM, or LOW

Confidence rules:
- HIGH: vendor, totalAmount, issueDate all clearly extracted
- MEDIUM: all key fields found but some ambiguity
- LOW: one or more key fields missing or unclear

Return format:
{"vendor": "", "invoiceNumber": "", "issueDate": "", "dueDate": "", "paymentTerms": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0, "category": "", "notes": "", "docType": "PI", "confidence": "HIGH"}`;

  const { text } = await geminiCall({
    contents: [{ role: "user", parts: [{ text: ocrText }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  }, 'extractInvoice');

  return text;
}

/**
 * Send a PDF buffer directly to Gemini for classification + invoice extraction in one call.
 * Skips OCR entirely — Gemini reads the PDF natively.
 */
export async function extractInvoiceFromPDF(
  pdfBuffer: Buffer,
  categories: string[],
  firmName?: string
): Promise<{ documentType: DocumentType; raw: string }> {
  const firmHint = firmName ? `\nThe uploading accounting firm is: "${firmName}". Use this to determine document direction (who is the buyer vs seller).` : '';
  const systemPrompt = `You are an expert document parser for Malaysian SME accounting.
Analyze this PDF document and:
1. Classify it as "receipt", "invoice", or "bank_statement"
2. Extract structured data
${firmHint}

FIRST PRIORITY — CHECK IF THIS IS A BANK STATEMENT:
A BANK STATEMENT is a document from a bank (Maybank, CIMB, OCBC, Public Bank, RHB, Hong Leong, AmBank, UOB, HSBC, etc.) showing:
- A list of MULTIPLE transactions over a date range (e.g. monthly statement period)
- Columns like Date, Description, Withdrawal/Deposit, Balance (or Debit/Credit/Balance)
- Opening balance and/or closing balance
- Account number, account holder name
- Bank letterhead/logo
If the document matches ANY of the above, it is a bank statement. Return ONLY: {"documentType": "bank_statement"}
Do NOT try to extract invoice fields from a bank statement. Do NOT classify it as an invoice, receipt, PV, or OR.

IMPORTANT: A bank transfer receipt, DuitNow confirmation, payment acknowledgment, or single transaction record from a bank is NOT a bank statement — it is a RECEIPT. Classify it as "receipt".

IMPORTANT: A "Credit Note" or "CN" is still classified as "invoice", but with a NEGATIVE totalAmount (e.g. -17.50). Credit notes represent refunds or adjustments owed back to the customer. Always prefix the notes with "CREDIT NOTE: " for credit notes.

If it is an INVOICE (or Credit Note or Debit Note or Payment Voucher or Official Receipt), extract:
- vendor: supplier/vendor name (for PI/CN/PV) or customer/buyer name (for SI/DN/OR)
- invoiceNumber: invoice or bill number, or Credit Note/Debit Note number (empty string if not found)
- issueDate: issue date in YYYY-MM-DD format
- dueDate: due date in YYYY-MM-DD format. If not explicitly stated but paymentTerms and issueDate are known, CALCULATE it (e.g. issueDate 2026-03-15 + "30 Days" = dueDate 2026-04-14). Empty string only if truly unknown.
- paymentTerms: e.g. "Net 30", "30 Days" (empty string if not found)
- subtotal: subtotal before tax (0 if not found). Use NEGATIVE for credit notes.
- taxAmount: tax/GST/SST amount (0 if not found). Use NEGATIVE for credit notes.
- totalAmount: total payable as number. Use NEGATIVE for credit notes (e.g. -17.50). Use the printed total on the invoice as-is. If there are deposit deductions shown, they are already reflected in the total — do not add them back. Mention any deposit deductions in notes for reference.
- category: pick BEST match from: [${categories.join(", ")}]. Base category on the PURPOSE of the payment (what was paid for), not the banking platform. Infer from recipient name and context.
- notes: important extra details the accountant should know — e.g. "Billed To" / "Bill To" person name, phone/account numbers, service period, line item summary, account holder name, reference numbers. ALWAYS include the "Billed To" or "Bill To" name if present. For credit notes, prefix with "CREDIT NOTE: ". For debit notes, prefix with "DEBIT NOTE: ". If there is a deposit deduction, note the deposit amount and any referenced invoice number. Keep it concise (2-3 lines max). Empty string if nothing notable.
- docType: document type classification. One of: PI, SI, CN, DN, PV, OR.
  - PI (Purchase Invoice): bill FROM a supplier TO the firm — firm owes money (amounts positive)
  - SI (Sales Invoice): bill FROM the firm TO a customer — customer owes money (amounts positive)
  - CN (Credit Note): supplier reduces what the firm owes — refund/adjustment (negative amounts, or document says "Credit Note"/"CN")
  - DN (Debit Note): firm adds charges to a customer — additional billing (firm is seller, document says "Debit Note"/"DN")
  - PV (Payment Voucher): proof of payment made by the firm
  - OR (Official Receipt): proof of payment received by the firm
  Default to PI if unclear.
- confidence: HIGH, MEDIUM, or LOW

If it is a RECEIPT, extract:
- date: date in YYYY-MM-DD format
- merchant: the actual payee/recipient, NOT the banking platform. For bank transfer receipts (Maybank2u, CIMB Clicks, DuitNow, FPX, etc.), use the "Transfer To" / "Recipient" / "Beneficiary" name. For regular purchase receipts, use the store/shop name.
- amount: total amount as number
- receiptNumber: receipt number or Reference ID for bank transfers (empty string if not found)
- category: pick BEST match from: [${categories.join(", ")}]. Base category on the PURPOSE of the payment (what was paid for), not the banking platform. Infer from recipient name and context.
- notes: important extra details — e.g. "Billed To" / "Bill To" person name, what was purchased, reference numbers, recipient reference, location. ALWAYS include the "Billed To" or "Bill To" name if present. Keep concise. Empty string if nothing notable.
- confidence: HIGH, MEDIUM, or LOW

Return ONLY valid JSON with a "documentType" field ("receipt" or "invoice") plus the extracted fields.

Invoice format: {"documentType": "invoice", "vendor": "", "invoiceNumber": "", "issueDate": "", "dueDate": "", "paymentTerms": "", "subtotal": 0, "taxAmount": 0, "totalAmount": 0, "category": "", "notes": "", "docType": "PI", "confidence": "HIGH"}

Receipt format: {"documentType": "receipt", "date": "", "merchant": "", "amount": 0, "receiptNumber": "", "category": "", "notes": "", "confidence": "HIGH"}`;

  const { text } = await geminiCall({
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
        { text: "Extract data from this document." },
      ],
    }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  }, 'extractPDF');

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
