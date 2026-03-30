import { GoogleAuth } from "google-auth-library";
import { readFileSync } from "fs";

export interface GeminiExtractionResult {
  date: string;
  merchant: string;
  amount: number;
  receiptNumber: string;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    // Try file path first, then inline JSON
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const credentials = JSON.parse(readFileSync(keyPath, "utf-8"));
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
    } else {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
      authClient = new GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
    }
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
