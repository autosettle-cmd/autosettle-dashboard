import { GoogleAuth } from "google-auth-library";
import { parseServiceAccountCredentials } from "@/lib/google-drive";

export interface ParsedCoaAccount {
  account_code: string;
  name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  normal_balance: 'Debit' | 'Credit';
  parent_code: string | null;
}

const TIMEOUT_MS = 60_000; // COA PDFs can be long
const MAX_RETRIES = 2;

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

async function getGeminiUrl(): Promise<{ url: string; token: string }> {
  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || "asia-southeast1";
  const model = process.env.VERTEX_MODEL || "gemini-1.5-flash";
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const auth = getAuthClient();
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  return { url, token: tokenResult.token! };
}

/**
 * Parse a Chart of Accounts PDF using Gemini multimodal.
 * Returns an array of parsed account entries for review before import.
 */
export async function parseCoaPdf(pdfBuffer: Buffer): Promise<ParsedCoaAccount[]> {
  const { url, token } = await getGeminiUrl();

  const systemPrompt = `You are an expert accounting chart of accounts parser.

Analyze this PDF document which contains a Chart of Accounts (COA) listing.
Extract ALL account entries with the following fields:

- account_code: the account code/number (e.g. "100-000", "211-001", "610")
- name: the account name (e.g. "Cash at Bank", "Trade Payables")
- account_type: classify as one of: Asset, Liability, Equity, Revenue, Expense
  - Asset: codes typically 100-199, includes cash, bank, receivables, fixed assets, prepaid
  - Liability: codes typically 200-299, includes payables, loans, accruals
  - Equity: codes typically 300-399, includes capital, retained earnings, reserves
  - Revenue: codes typically 400-499 or 500-599, includes sales, income, interest received
  - Expense: codes typically 600-999, includes purchases, COGS, operating expenses
- normal_balance: "Debit" for Assets and Expenses, "Credit" for Liabilities, Equity, and Revenue
- parent_code: if this account is a sub-account, provide the parent's account code. null if top-level.
  Infer parent-child from indentation, code patterns (e.g. 211-001 is child of 211-000), or grouping.

Rules:
- Extract EVERY account, including headers/parent accounts
- Preserve the exact account codes as printed
- If account type is ambiguous, use the code range as primary guide
- For parent_code: use the nearest parent (e.g. 618-001 parent is 618-000, not 600-000)

Return ONLY a JSON array of objects. No markdown, no explanation.
Example: [{"account_code":"100-000","name":"Cash & Bank","account_type":"Asset","normal_balance":"Debit","parent_code":null}]`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString("base64") } },
              { text: "Extract the complete Chart of Accounts from this PDF." },
            ],
          }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        const retryable = [429, 500, 502, 503].includes(res.status);
        console.error(`[COA Parser] Attempt ${attempt + 1} failed: ${res.status} — ${errText.slice(0, 200)}`);
        if (retryable && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No response from Gemini");

      // Parse JSON from response
      let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      if (cleaned.startsWith("[") && !cleaned.endsWith("]")) cleaned += "]";

      const parsed = JSON.parse(cleaned) as ParsedCoaAccount[];

      // Validate
      const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
      return parsed.filter(a =>
        a.account_code?.trim() &&
        a.name?.trim() &&
        validTypes.includes(a.account_type)
      ).map(a => ({
        account_code: a.account_code.trim(),
        name: a.name.trim(),
        account_type: a.account_type,
        normal_balance: ['Asset', 'Expense'].includes(a.account_type) ? 'Debit' : 'Credit',
        parent_code: a.parent_code?.trim() || null,
      }));
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === 'AbortError') {
        console.error(`[COA Parser] Attempt ${attempt + 1} timed out`);
        if (attempt < MAX_RETRIES) continue;
        throw new Error('COA parsing timed out after multiple attempts');
      }
      if (attempt === MAX_RETRIES) throw err;
    }
  }

  throw new Error('COA parsing failed after all attempts');
}
