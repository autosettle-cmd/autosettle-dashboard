import { GeminiExtractionResult, GeminiInvoiceResult, InvoiceDocType } from "./gemini";

function cleanGeminiJson(raw: string): string {
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Fix truncated JSON
  if (!cleaned.endsWith("}") && !cleaned.endsWith("]")) {
    cleaned = cleaned.replace(/,?\s*$/, "");
    const quoteCount = (cleaned.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) cleaned += '"';
    if (cleaned.startsWith("[")) {
      cleaned += "}]";
    } else {
      cleaned += "}";
    }
  }

  return cleaned;
}

function parseSingleReceipt(parsed: Record<string, unknown>): GeminiExtractionResult {
  const fallback: GeminiExtractionResult = {
    date: "", merchant: "", amount: 0, receiptNumber: "", category: "", notes: "", confidence: "LOW",
  };

  if (!parsed.date || !parsed.merchant || !parsed.amount || !parsed.category) {
    return { ...fallback, ...parsed, confidence: "LOW" } as GeminiExtractionResult;
  }

  return {
    date: String(parsed.date),
    merchant: String(parsed.merchant),
    amount: Number(parsed.amount),
    receiptNumber: String(parsed.receiptNumber || ""),
    category: String(parsed.category),
    notes: String(parsed.notes || ""),
    confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence as string)
      ? (parsed.confidence as "HIGH" | "MEDIUM" | "LOW")
      : "LOW",
  };
}

/**
 * Parse and validate Gemini's JSON output.
 * Returns a single result for backward compat.
 */
export function parseGeminiOutput(raw: string): GeminiExtractionResult {
  try {
    const cleaned = cleanGeminiJson(raw);
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parseSingleReceipt(parsed[0] ?? {});
    }
    return parseSingleReceipt(parsed);
  } catch {
    return { date: "", merchant: "", amount: 0, receiptNumber: "", category: "", notes: "", confidence: "LOW" };
  }
}

/**
 * Parse Gemini output that may contain multiple receipts.
 * Returns array of results.
 */
export function parseGeminiOutputMultiple(raw: string): GeminiExtractionResult[] {
  try {
    const cleaned = cleanGeminiJson(raw);
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.map((item: Record<string, unknown>) => parseSingleReceipt(item));
    }
    return [parseSingleReceipt(parsed)];
  } catch {
    return [{ date: "", merchant: "", amount: 0, receiptNumber: "", category: "", notes: "", confidence: "LOW" }];
  }
}

/**
 * Parse and validate Gemini's invoice JSON output.
 */
export function parseGeminiInvoiceOutput(raw: string): GeminiInvoiceResult {
  const fallback: GeminiInvoiceResult = {
    vendor: "",
    invoiceNumber: "",
    issueDate: "",
    dueDate: "",
    paymentTerms: "",
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    category: "",
    notes: "",
    docType: "PI",
    confidence: "LOW",
  };

  try {
    let cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    if (!cleaned.endsWith("}")) {
      cleaned = cleaned.replace(/,?\s*$/, "");
      const quoteCount = (cleaned.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) cleaned += '"';
      cleaned += "}";
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed.vendor || !parsed.totalAmount) {
      return { ...fallback, ...parsed, confidence: "LOW" };
    }

    const notes = String(parsed.notes || "");
    const totalAmount = Number(parsed.totalAmount);

    // Layer 1: Gemini docType (default PI)
    const validDocTypes: InvoiceDocType[] = ['PI', 'SI', 'CN', 'DN', 'PV', 'OR'];
    let docType: InvoiceDocType = validDocTypes.includes(parsed.docType) ? parsed.docType : 'PI';

    // Layer 3: Amount/keyword fallback corrections
    if (docType === 'PI' && totalAmount < 0) docType = 'CN';
    if (notes.toUpperCase().startsWith('CREDIT NOTE:') && docType !== 'CN') docType = 'CN';
    if (notes.toUpperCase().startsWith('DEBIT NOTE:') && docType !== 'DN') docType = 'DN';

    // Post-process: detect if notes mention a deposit — informational notice
    let depositWarning: string | undefined;
    const depositMatch = notes.match(/deposit[^.]*?(?:RM\s?)?(\d[\d,]*(?:\.\d{2})?)/i);
    if (depositMatch) {
      const depositAmount = parseFloat(depositMatch[1].replace(/,/g, ''));
      if (depositAmount > 0) {
        depositWarning = `This invoice mentions a deposit of RM ${depositAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}. The deposit payment should be matched separately in Bank Reconciliation.`;
      }
    }

    return {
      vendor: String(parsed.vendor),
      invoiceNumber: String(parsed.invoiceNumber || ""),
      issueDate: String(parsed.issueDate || ""),
      dueDate: String(parsed.dueDate || ""),
      paymentTerms: String(parsed.paymentTerms || ""),
      subtotal: Number(parsed.subtotal || 0),
      taxAmount: Number(parsed.taxAmount || 0),
      totalAmount,
      category: String(parsed.category || ""),
      notes,
      docType,
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence)
        ? parsed.confidence
        : "LOW",
      depositWarning,
    };
  } catch {
    return fallback;
  }
}
