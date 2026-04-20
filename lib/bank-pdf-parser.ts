// Import the internal module directly to avoid pdf-parse's index.js
// which has a debug mode that tries to read test files on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse/lib/pdf-parse.js');
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedBankTransaction {
  transactionDate: Date;
  description: string;
  reference: string | null;
  chequeNumber: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export interface ParseResult {
  transactions: ParsedBankTransaction[];
  bankName: string;
  accountNumber: string | null;
  statementDate: Date | null;
  openingBalance: number | null;
  closingBalance: number | null;
  totalCredit: number | null;
  totalDebit: number | null;
  fileHash: string;
  errors: string[];
  usedGeminiFallback?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAmount(raw: string): { value: number; isDebit: boolean } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  const isDebit = cleaned.endsWith('-');
  const numStr = cleaned.replace(/[+-]$/, '');
  const value = parseFloat(numStr);
  if (isNaN(value)) return null;
  return { value, isDebit };
}

function parseBalance(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').trim();
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

function parseMaybankDate(dateStr: string, fallbackYear?: number): Date {
  const parts = dateStr.split('/').map(Number);
  if (parts.length === 3) {
    // DD/MM/YY
    const [dd, mm, yy] = parts;
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return new Date(year, mm - 1, dd);
  }
  // DD/MM (no year) — use fallback year from statement date
  const [dd, mm] = parts;
  const year = fallbackYear ?? new Date().getFullYear();
  return new Date(year, mm - 1, dd);
}

// ─── Maybank Parser ──────────────────────────────────────────────────────────

function parseMaybank(fullText: string): Omit<ParseResult, 'fileHash'> {
  const errors: string[] = [];
  const transactions: ParsedBankTransaction[] = [];

  let accountNumber: string | null = null;
  let statementDate: Date | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let totalCredit: number | null = null;
  let totalDebit: number | null = null;

  const acctMatch = fullText.match(/ACCOUNT\s*NUMBER\s*:?\s*([\d-]+)/);
  if (acctMatch) accountNumber = acctMatch[1];

  // Statement date: DD/MM/YY or DD/MM/YYYY
  const dateMatch = fullText.match(/STATEMENT\s*DATE\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/);
  if (dateMatch) {
    const parts = dateMatch[1].split('/');
    if (parts[2].length === 4) {
      // DD/MM/YYYY format
      statementDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else {
      statementDate = parseMaybankDate(dateMatch[1]);
    }
  }

  const openMatch = fullText.match(/BEGINNING\s+BALANCE\s*([\d,]+\.\d{2})/);
  if (openMatch) openingBalance = parseBalance(openMatch[1]);

  const closeMatch = fullText.match(/ENDING\s+BALANCE\s*:?\s*([\d,]+\.\d{2})/);
  if (closeMatch) closingBalance = parseBalance(closeMatch[1]);

  const creditMatch = fullText.match(/TOTAL\s+CREDIT\s*:?\s*([\d,]+\.\d{2})/);
  if (creditMatch) totalCredit = parseBalance(creditMatch[1]);
  const debitMatch = fullText.match(/TOTAL\s+DEBIT\s*:?\s*([\d,]+\.\d{2})/);
  if (debitMatch) totalDebit = parseBalance(debitMatch[1]);

  const lines = fullText.split('\n');

  // pdf-parse v1 concatenates columns without spaces in Maybank PDFs
  // Transaction line formats:
  // DD/MM/YY<description><amount+/-><balance>  (e.g. "01/11/25IBK FUND TFR FR A/C50.00-1,190.99")
  // DD/MM<description><amount+/-><balance>     (e.g. "29/11TRANSFER FR A/C55.00-55.00")
  const txnLineRegex = /^(\d{2}\/\d{2}(?:\/\d{2})?)(.+?)([\d,]+\.\d{2}[+-])([\d,]+\.\d{2})\s*$/;

  let currentTxn: {
    date: string;
    descriptionLines: string[];
    amount: string;
    balance: string;
  } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip known non-transaction lines — BUT only when NOT building a transaction.
    // When inside a transaction (currentTxn != null), continuation lines like
    // "JUNORISE SDN. BHD. *" or "I000034" must be kept as description lines.
    const isPageNoise =
        line.includes('URUSNIAGA AKAUN') || line.includes('TARIKH MASUK') ||
        line.includes('ENTRY DATE') || line.includes('進支日期') ||
        line.includes('Maybank Islamic') || line.includes('PROTECTED BY PIDM') ||
        line.includes('Perhation') || line.includes('Semua maklumat') ||
        line.includes('若银行') || line.includes('All items and balances') ||
        line.includes('Sila beritahu') || line.includes('請通知') ||
        line.includes('Please notify') || line.startsWith('IBS ') ||
        line.includes('MUKA/') || line.includes('NOMBOR AKAUN') ||
        line.includes('STATEMENT DATE') || line.includes('TARIKH PENYATA') ||
        line.includes('結單日期') || line.includes('戶號') ||
        line.includes('tempoh 21 hari') || line.includes('戶口進支項') ||
        line.includes('進支項說明') || line.includes('银碼') ||
        line.includes('結單存餘') || line.match(/^\d{6}\s/) ||
        line.includes('SELANGOR ,MYS') || line.includes('47500') ||
        line.includes('CURRENT ACCOUNT');

    // Strong page-noise markers that flush even during a transaction
    const isStrongPageNoise =
        line.includes('URUSNIAGA AKAUN') || line.includes('ENTRY DATE') ||
        line.includes('MUKA/') || line.includes('NOMBOR AKAUN') ||
        line.includes('STATEMENT DATE') || line.includes('TARIKH PENYATA') ||
        line.includes('PROTECTED BY PIDM') || line.includes('Maybank Islamic');

    if (isPageNoise) {
      if (currentTxn && isStrongPageNoise) {
        // Definite page header — flush current transaction
        flushTransaction(currentTxn, transactions, statementDate?.getFullYear());
        currentTxn = null;
      } else if (!currentTxn) {
        // Not in a transaction — safe to skip
      }
      // If in a transaction and NOT strong noise, fall through to continuation logic below
      if (!currentTxn || isStrongPageNoise) continue;
    }
    if (line.startsWith('BEGINNING BALANCE') || line.startsWith('ENDING BALANCE') ||
        line.startsWith('TOTAL CREDIT') || line.startsWith('TOTAL DEBIT') ||
        line.startsWith('LEDGER BALANCE') || line.startsWith('PROFIT OUTSTANDING')) {
      if (currentTxn) {
        flushTransaction(currentTxn, transactions, statementDate?.getFullYear());
        currentTxn = null;
      }
      continue;
    }

    // Check for address/name lines that appear in page headers
    // Only skip when NOT building a transaction — these patterns are too broad
    // and can match payee names like "JUNORISE SDN. BHD." or "NO 10 , JALAN..."
    if (!currentTxn && (line.match(/^[A-Z\s,]+\d{5}/) || line.match(/NO \d+ ,/))) {
      continue;
    }

    const txnMatch = line.match(txnLineRegex);

    if (txnMatch) {
      if (currentTxn) {
        flushTransaction(currentTxn, transactions, statementDate?.getFullYear());
      }
      currentTxn = {
        date: txnMatch[1],
        descriptionLines: [txnMatch[2].trim()],
        amount: txnMatch[3],
        balance: txnMatch[4],
      };
    } else if (currentTxn && (line.match(/^\s{2,}/) || !line.match(/^\d{2}\/\d{2}\/\d{2}/))) {
      // Continuation line (indented or doesn't start with date)
      currentTxn.descriptionLines.push(line.trim());
    }
  }

  if (currentTxn) {
    flushTransaction(currentTxn, transactions, statementDate?.getFullYear());
  }

  if (transactions.length === 0) {
    errors.push('No transactions found in PDF text');
  }

  return {
    transactions,
    bankName: 'Maybank',
    accountNumber,
    statementDate,
    openingBalance,
    closingBalance,
    totalCredit,
    totalDebit,
    errors,
  };
}

function flushTransaction(
  txn: { date: string; descriptionLines: string[]; amount: string; balance: string },
  transactions: ParsedBankTransaction[],
  fallbackYear?: number
) {
  const parsed = parseAmount(txn.amount);
  if (!parsed) return;

  const description = txn.descriptionLines.join(' | ');

  let reference: string | null = null;
  for (const line of txn.descriptionLines) {
    if (line.match(/^[A-Z0-9]{10,}$/)) { reference = line; break; }
    if (line.match(/^MBBQR\d+/)) { reference = line; break; }
    if (line.match(/^\d{16,}/)) { reference = line; break; }
  }

  transactions.push({
    transactionDate: parseMaybankDate(txn.date, fallbackYear),
    description,
    reference,
    chequeNumber: null,
    debit: parsed.isDebit ? parsed.value : null,
    credit: !parsed.isDebit ? parsed.value : null,
    balance: parseBalance(txn.balance),
  });
}

// ─── OCBC Parser ────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseOcbcDate(dateStr: string): Date {
  // "11 DEC 2023"
  const parts = dateStr.trim().split(/\s+/);
  const day = parseInt(parts[0]);
  const month = MONTHS[parts[1].toUpperCase()] ?? 0;
  const year = parseInt(parts[2]);
  return new Date(year, month, day);
}

function parseOcbc(fullText: string): Omit<ParseResult, 'fileHash'> {
  const errors: string[] = [];
  const transactions: ParsedBankTransaction[] = [];

  let accountNumber: string | null = null;
  let statementDate: Date | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let totalCredit: number | null = null;
  let totalDebit: number | null = null;

  // Account number: 710-135443-3
  const acctMatch = fullText.match(/Account\s*Number\s*\/\s*Nombor\s*Akaun\s*:?\s*([\d-]+)/i);
  if (acctMatch) accountNumber = acctMatch[1].trim();

  // Statement date: "09 DEC 2023 TO 31 DEC 2023" — use the end date
  const stmtDateMatch = fullText.match(/(\d{2}\s+[A-Z]{3}\s+\d{4})\s*TO\s*(\d{2}\s+[A-Z]{3}\s+\d{4})/i);
  if (stmtDateMatch) statementDate = parseOcbcDate(stmtDateMatch[2]);

  // Balance B/F — may be concatenated like "Balance B/F0.00"
  const bfMatch = fullText.match(/Balance\s*B\/F\s*([\d,]+\.\d{2})/);
  if (bfMatch) openingBalance = parseBalance(bfMatch[1]);

  // Totals from TRANSACTION SUMMARY
  const totalWithdrawalsMatch = fullText.match(/Total\s+Withdrawals\s*([\d,]+\.\d{2})/);
  if (totalWithdrawalsMatch) totalDebit = parseBalance(totalWithdrawalsMatch[1]);
  const totalDepositsMatch = fullText.match(/Total\s+Deposits\s*([\d,]+\.\d{2})/);
  if (totalDepositsMatch) totalCredit = parseBalance(totalDepositsMatch[1]);

  const lines = fullText.split('\n');

  // OCBC pdf-parse concatenates columns WITHOUT spaces:
  // "DUITNOW(INST TRF) CR11 DEC 2023500.00500.00/IB"
  // Pattern: <description><DD MMM YYYY><amount(s)><chequeNo?>
  // The date is embedded in the middle of the line
  const embeddedDateRegex = /(\d{2}\s+[A-Z]{3}\s+\d{4})/;

  let currentTxn: {
    date: Date;
    descriptionLines: string[];
    withdrawal: number | null;
    deposit: number | null;
    balance: number | null;
    chequeNo: string | null;
  } | null = null;

  let lastBalance = openingBalance ?? 0;
  let inTransactions = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Start after Balance B/F
    if (line.match(/^Balance\s*B\/F/)) { inTransactions = true; continue; }
    if (line.includes('TRANSACTION')) break;
    if (!inTransactions) continue;

    // Skip noise lines
    if (line.includes('Page ') || line.includes('OCBC') || line.includes('Member of')) continue;

    // Check for embedded date (transaction line)
    const dateMatch = line.match(embeddedDateRegex);

    if (dateMatch) {
      // Flush previous transaction
      if (currentTxn) {
        transactions.push({
          transactionDate: currentTxn.date,
          description: currentTxn.descriptionLines.join(' | '),
          reference: null,
          chequeNumber: currentTxn.chequeNo,
          debit: currentTxn.withdrawal,
          credit: currentTxn.deposit,
          balance: currentTxn.balance,
        });
        if (currentTxn.balance !== null) lastBalance = currentTxn.balance;
      }

      const dateStr = dateMatch[1];
      const dateIdx = line.indexOf(dateStr);
      const description = line.slice(0, dateIdx).trim();
      const afterDate = line.slice(dateIdx + dateStr.length);

      // Extract amounts and optional cheque number from afterDate
      // e.g. "500.00500.00/IB" or "1,200.00300.00" or "50.001,150.00"
      let withdrawal: number | null = null;
      let deposit: number | null = null;
      let balance: number | null = null;
      let chequeNo: string | null = null;

      // Check for cheque number at end (e.g., "/IB", "/CHQ")
      let amountPart = afterDate;
      const chequeMatch = amountPart.match(/(\/\w+)\s*$/);
      if (chequeMatch) {
        chequeNo = chequeMatch[1];
        amountPart = amountPart.slice(0, amountPart.lastIndexOf(chequeMatch[1]));
      }

      // Extract amounts — they're concatenated like "500.00500.00" or "1,200.003,500.00"
      const amountMatches = amountPart.match(/[\d,]+\.\d{2}/g);

      if (amountMatches && amountMatches.length >= 2) {
        // Last amount is always balance
        balance = parseBalance(amountMatches[amountMatches.length - 1]);

        if (amountMatches.length === 2) {
          // One amount + balance — determine debit or credit
          const amt = parseBalance(amountMatches[0])!;
          if (balance !== null && balance < lastBalance) {
            withdrawal = amt;
          } else {
            deposit = amt;
          }
        } else if (amountMatches.length === 3) {
          // withdrawal + deposit + balance
          const a1 = parseBalance(amountMatches[0])!;
          const a2 = parseBalance(amountMatches[1])!;
          if (a1 > 0 && a2 === 0) { withdrawal = a1; }
          else if (a2 > 0 && a1 === 0) { deposit = a2; }
          else { withdrawal = a1; deposit = a2; }
        }
      } else if (amountMatches && amountMatches.length === 1) {
        balance = parseBalance(amountMatches[0]);
      }

      currentTxn = {
        date: parseOcbcDate(dateStr),
        descriptionLines: description ? [description] : [],
        withdrawal,
        deposit,
        balance,
        chequeNo,
      };
    } else if (currentTxn) {
      // Continuation line (DESC:, REF:, name, etc.)
      currentTxn.descriptionLines.push(line);
    }
  }

  // Flush last transaction
  if (currentTxn) {
    transactions.push({
      transactionDate: currentTxn.date,
      description: currentTxn.descriptionLines.join(' | '),
      reference: null,
      chequeNumber: currentTxn.chequeNo,
      debit: currentTxn.withdrawal,
      credit: currentTxn.deposit,
      balance: currentTxn.balance,
    });
  }

  // Closing balance = last transaction's balance
  if (transactions.length > 0) {
    closingBalance = transactions[transactions.length - 1].balance;
  }

  if (transactions.length === 0) {
    errors.push('No transactions found in PDF text');
  }

  return {
    transactions,
    bankName: 'OCBC',
    accountNumber,
    statementDate,
    openingBalance,
    closingBalance,
    totalCredit,
    totalDebit,
    errors,
  };
}

// ─── Bank Detection ──────────────────────────────────────────────────────────

function detectBank(text: string): string {
  if (text.includes('OCBC Bank') || text.includes('OCBC Group') || text.includes('ocbc.com.my')) return 'OCBC';
  if (text.includes('Maybank') || text.includes('MAYBANK') || text.includes('MBB CT')) return 'Maybank';
  if (text.includes('CIMB') || text.includes('CIMB BANK')) return 'CIMB';
  if (text.includes('PUBLIC BANK') || text.includes('Public Bank')) return 'Public Bank';
  if (text.includes('AMBANK') || text.includes('AmBank')) return 'AmBank';
  if (text.includes('RHB') || text.includes('RHB BANK')) return 'RHB';
  if (text.includes('HONG LEONG') || text.includes('Hong Leong')) return 'Hong Leong';
  return 'Unknown';
}

// ─── Gemini Fallback ────────────────────────────────────────────────────────

async function extractWithGeminiBankStatement(fullText: string, detectedBank: string = 'Unknown'): Promise<Omit<ParseResult, 'fileHash'>> {
  const { GoogleAuth } = await import('google-auth-library');
  const { parseServiceAccountCredentials } = await import('@/lib/google-drive');

  const projectId = process.env.VERTEX_PROJECT_ID!;
  const location = process.env.VERTEX_LOCATION || 'asia-southeast1';
  const model = process.env.VERTEX_MODEL || 'gemini-1.5-flash';

  const credentials = parseServiceAccountCredentials();
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const systemPrompt = `You are an expert bank statement parser for Malaysian banks.
Extract ALL transactions and metadata from this bank statement text.
Return ONLY valid JSON, no explanation, no markdown.

Return format:
{
  "bankName": "Maybank",
  "accountNumber": "562526546065",
  "statementDate": "2023-11-30",
  "openingBalance": 110.00,
  "closingBalance": 55.00,
  "totalDebit": 55.00,
  "totalCredit": 0.00,
  "transactions": [
    {
      "date": "2023-11-29",
      "description": "TRANSFER FR A/C | WONG BAO YING | Sachet design | MBB CT",
      "debit": 55.00,
      "credit": null,
      "balance": 55.00,
      "reference": null
    }
  ]
}

Rules:
- date must be YYYY-MM-DD format
- debit/credit: use null if not applicable, number if applicable
- balance: the running balance after this transaction — NEVER use the balance value as debit or credit
- reference: transaction reference number if visible, null otherwise
- description: ONLY include the actual transaction description lines (payee name, transfer details, payment method). Join multiple lines with " | ". NEVER include page headers, footers, bank disclaimers, addresses, marketing text, page numbers, or boilerplate text.
- Negative amounts or amounts with "-" suffix are DEBITS
- Positive amounts or amounts with "+" suffix are CREDITS
- BEGINNING BALANCE, ENDING BALANCE, TOTAL DEBIT, TOTAL CREDIT are metadata, NOT transactions
- If the same text appears across multiple pages (headers, footers, account info), it is NOT a transaction${detectedBank === 'OCBC' ? `

OCBC-specific rules (THIS IS AN OCBC STATEMENT):
- OCBC raw text has columns MERGED together without separators. The pattern is:
  - For DEPOSITS (e.g. BULK CREDIT): DESCRIPTION + DATE + BALANCE + DEPOSIT_AMOUNT + CHEQUE_NO
    Example: "BULK CREDIT01 OCT 202566,897.52482.00/IB" → date=01 OCT 2025, credit=482.00, balance=66,897.52
  - For WITHDRAWALS (e.g. DUITNOW): DESCRIPTION + DATE + BALANCE + CHEQUE_NO + WITHDRAWAL_AMOUNT
    Example: "DUITNOW(INST TRF) DR05 OCT 202567,445.47/IB700.00" → date=05 OCT 2025, debit=700.00, balance=67,445.47
- The FIRST number after the date is ALWAYS the balance (running total). It is NEVER the transaction amount.
- If the transaction amount appears BEFORE /IB, it is a DEPOSIT (credit)
- If the transaction amount appears AFTER /IB, it is a WITHDRAWAL (debit)
- NEVER use the balance value as debit or credit
- "Balance B/F" is the opening balance, NOT a transaction
- Lines containing "Statement Date / Tarikh Penyata", "Account Branch / Cawangan Akaun", "Account Number / Nombor Akaun", page headers, or boilerplate text are NOT transactions
- If a row has no amount in Withdrawal or Deposit columns, it is a continuation of the previous transaction's description, NOT a new transaction` : ''}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.token}`,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  const transactions: ParsedBankTransaction[] = (parsed.transactions || []).map((t: { date: string; description: string; debit: number | null; credit: number | null; balance: number | null; reference: string | null }) => ({
    transactionDate: new Date(t.date),
    description: t.description || '',
    reference: t.reference || null,
    chequeNumber: null,
    debit: t.debit ?? null,
    credit: t.credit ?? null,
    balance: t.balance ?? null,
  }));

  return {
    transactions,
    bankName: parsed.bankName || 'Unknown',
    accountNumber: parsed.accountNumber || null,
    statementDate: parsed.statementDate ? new Date(parsed.statementDate) : null,
    openingBalance: parsed.openingBalance ?? null,
    closingBalance: parsed.closingBalance ?? null,
    totalCredit: parsed.totalCredit ?? null,
    totalDebit: parsed.totalDebit ?? null,
    errors: [],
  };
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function parseBankStatementPDF(pdfBuffer: Buffer, password?: string): Promise<ParseResult> {
  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  try {
    const options: Record<string, unknown> = {};
    if (password) options.password = password;

    const data = await pdf(pdfBuffer, options);
    const fullText = data.text;
    const bank = detectBank(fullText);

    // Primary: use Gemini text extraction (reliable, works for any bank)
    try {
      console.error(`[BankParser] Using Gemini text extraction for ${bank} statement`);
      const geminiResult = await extractWithGeminiBankStatement(fullText, bank);
      if (geminiResult.transactions.length > 0) {
        // Use detectBank() for consistent bank name (Gemini returns variable names like "OCBC Bank (Malaysia) Berhad")
        const normalizedBankName = bank !== 'Unknown' ? bank : geminiResult.bankName;
        // Normalize account number — strip dashes and spaces for consistent grouping
        const normalizedAccount = geminiResult.accountNumber?.replace(/[-\s]/g, '') || null;
        return { ...geminiResult, bankName: normalizedBankName, accountNumber: normalizedAccount, fileHash };
      }
      console.error(`[BankParser] Gemini returned 0 transactions — falling back to regex`);
    } catch (geminiErr) {
      console.error('[BankParser] Gemini extraction failed, falling back to regex:', geminiErr);
    }

    // Fallback: regex parser (free, offline-safe)
    let regexResult: Omit<ParseResult, 'fileHash'> | null = null;
    if (bank === 'Maybank') {
      regexResult = parseMaybank(fullText);
    } else if (bank === 'OCBC') {
      regexResult = parseOcbc(fullText);
    }

    if (regexResult && regexResult.transactions.length > 0) {
      const normalizedAccount = regexResult.accountNumber?.replace(/[-\s]/g, '') || null;
      return { ...regexResult, accountNumber: normalizedAccount, fileHash, usedGeminiFallback: false };
    }

    return {
      transactions: [],
      bankName: bank,
      accountNumber: null,
      statementDate: null,
      openingBalance: null,
      closingBalance: null,
      totalCredit: null,
      totalDebit: null,
      fileHash,
      errors: ['No transactions found by Gemini or regex extraction'],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isPasswordError = /password|encrypted|decrypt/i.test(msg);

    return {
      transactions: [],
      bankName: 'Unknown',
      accountNumber: null,
      statementDate: null,
      openingBalance: null,
      closingBalance: null,
      totalCredit: null,
      totalDebit: null,
      fileHash,
      errors: [isPasswordError
        ? (password ? 'Incorrect password for this PDF.' : 'PASSWORD_REQUIRED')
        : `PDF parsing failed: ${msg}`],
    };
  }
}
