import { GeminiExtractionResult } from "./gemini";

/**
 * Parse and validate Gemini's JSON output.
 * If parsing or validation fails, returns a LOW confidence result with empty fields.
 */
export function parseGeminiOutput(raw: string): GeminiExtractionResult {
  const fallback: GeminiExtractionResult = {
    date: "",
    merchant: "",
    amount: 0,
    receiptNumber: "",
    category: "",
    confidence: "LOW",
  };

  try {
    // Strip markdown fences if present
    let cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    // Fix truncated JSON — if it doesn't end with }, try to close it
    if (!cleaned.endsWith("}")) {
      // Attempt to find the last complete key-value pair and close the object
      // e.g. "confidence": "HIGH  →  "confidence": "HIGH"}
      cleaned = cleaned.replace(/,?\s*$/, "");
      // Close any open string
      const quoteCount = (cleaned.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        cleaned += '"';
      }
      cleaned += "}";
    }

    const parsed = JSON.parse(cleaned);

    // Validate required fields exist
    if (!parsed.date || !parsed.merchant || !parsed.amount || !parsed.category) {
      return { ...fallback, ...parsed, confidence: "LOW" };
    }

    return {
      date: String(parsed.date),
      merchant: String(parsed.merchant),
      amount: Number(parsed.amount),
      receiptNumber: String(parsed.receiptNumber || ""),
      category: String(parsed.category),
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence)
        ? parsed.confidence
        : "LOW",
    };
  } catch {
    return fallback;
  }
}
