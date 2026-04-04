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

function parseMaybankDate(dateStr: string): Date {
  const [dd, mm, yy] = dateStr.split('/').map(Number);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
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

  const acctMatch = fullText.match(/ACCOUNT\s*NUMBER\s*:\s*([\d-]+)/);
  if (acctMatch) accountNumber = acctMatch[1];

  const dateMatch = fullText.match(/STATEMENT\s*DATE\s*:\s*(\d{2}\/\d{2}\/\d{2})/);
  if (dateMatch) statementDate = parseMaybankDate(dateMatch[1]);

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
  // Transaction line: DD/MM/YY<description><amount+/-><balance>
  // e.g. "01/11/25IBK FUND TFR FR A/C50.00-1,190.99"
  // or   "01/11/25CASH DEPOSIT5,000.00+5,709.99"
  const txnLineRegex = /^(\d{2}\/\d{2}\/\d{2})(.+?)([\d,]+\.\d{2}[+-])([\d,]+\.\d{2})\s*$/;

  let currentTxn: {
    date: string;
    descriptionLines: string[];
    amount: string;
    balance: string;
  } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip known non-transaction lines
    if (line.includes('URUSNIAGA AKAUN') || line.includes('TARIKH MASUK') ||
        line.includes('ENTRY DATE') || line.includes('進支日期') ||
        line.includes('Maybank Islamic') || line.includes('PROTECTED BY PIDM') ||
        line.includes('Perhation') || line.includes('Semua maklumat') ||
        line.includes('若银行') || line.includes('All items and balances') ||
        line.includes('Sila beritahu') || line.includes('請通知') ||
        line.includes('Please notify') || line.includes('IBS TANJONG') ||
        line.includes('MUKA/') || line.includes('NOMBOR AKAUN') ||
        line.includes('STATEMENT DATE') || line.includes('ACCOUNT') ||
        line.includes('TARIKH PENYATA') || line.includes('結單日期') ||
        line.includes('戶號') || line.includes('tempoh 21 hari') ||
        line.includes('戶口進支項') || line.includes('進支項說明') ||
        line.includes('银碼') || line.includes('結單存餘') ||
        line.match(/^\d{6}\s/) ||
        line.includes('SELANGOR ,MYS') || line.includes('47500')) continue;
    if (line.startsWith('BEGINNING BALANCE') || line.startsWith('ENDING BALANCE') ||
        line.startsWith('TOTAL CREDIT') || line.startsWith('TOTAL DEBIT')) continue;

    // Check for address/name lines that appear in page headers
    // These typically contain the account holder info repeated on every page
    if (line.match(/^[A-Z\s,]+\d{5}/) || line.match(/NO \d+ ,/)) continue;

    const txnMatch = line.match(txnLineRegex);

    if (txnMatch) {
      if (currentTxn) {
        flushTransaction(currentTxn, transactions);
      }
      currentTxn = {
        date: txnMatch[1],
        descriptionLines: [txnMatch[2].trim()],
        amount: txnMatch[3],
        balance: txnMatch[4],
      };
    } else if (currentTxn && line.match(/^\s{2,}/) || (currentTxn && !line.match(/^\d{2}\/\d{2}\/\d{2}/))) {
      // Continuation line (indented or doesn't start with date)
      if (currentTxn) {
        currentTxn.descriptionLines.push(line.trim());
      }
    }
  }

  if (currentTxn) {
    flushTransaction(currentTxn, transactions);
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
  transactions: ParsedBankTransaction[]
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
    transactionDate: parseMaybankDate(txn.date),
    description,
    reference,
    chequeNumber: null,
    debit: parsed.isDebit ? parsed.value : null,
    credit: !parsed.isDebit ? parsed.value : null,
    balance: parseBalance(txn.balance),
  });
}

// ─── Bank Detection ──────────────────────────────────────────────────────────

function detectBank(text: string): string {
  if (text.includes('Maybank') || text.includes('MAYBANK') || text.includes('MBB CT')) return 'Maybank';
  if (text.includes('CIMB') || text.includes('CIMB BANK')) return 'CIMB';
  if (text.includes('PUBLIC BANK') || text.includes('Public Bank')) return 'Public Bank';
  if (text.includes('AMBANK') || text.includes('AmBank')) return 'AmBank';
  if (text.includes('RHB') || text.includes('RHB BANK')) return 'RHB';
  if (text.includes('HONG LEONG') || text.includes('Hong Leong')) return 'Hong Leong';
  return 'Unknown';
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function parseBankStatementPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  try {
    const data = await pdf(pdfBuffer);
    const fullText = data.text;
    const bank = detectBank(fullText);

    if (bank === 'Maybank') {
      const parsed = parseMaybank(fullText);
      return { ...parsed, fileHash };
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
      errors: [`Bank format "${bank}" is not yet supported. Please contact support.`],
    };
  } catch (e) {
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
      errors: [`PDF parsing failed: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}
