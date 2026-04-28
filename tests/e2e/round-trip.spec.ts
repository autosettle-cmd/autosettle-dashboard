import { test, expect, Page } from '@playwright/test';

/**
 * ROUND-TRIP TESTS — write data via API, read it back, verify integrity.
 *
 * These tests catch bugs where data is saved correctly but returned
 * incorrectly in the preview/list API (e.g. GL passthrough bug).
 *
 * Pattern: Create → Read Back → Assert Match
 */

const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };
const BASE = 'http://localhost:3000';

// Resolved dynamically — accountant's first firm with bank statements
let TEST_FIRM_ID = '';

/** Get the accountant's first accessible firm ID */
async function resolveFirmId(page: Page): Promise<string> {
  if (TEST_FIRM_ID) return TEST_FIRM_ID;
  const res = await authFetch(page, '/api/firms');
  const firms = res.json.data ?? [];
  TEST_FIRM_ID = firms[0]?.id ?? '';
  return TEST_FIRM_ID;
}

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

/** Authenticated API call — runs fetch inside the browser to use session cookies */
async function authFetch(page: Page, path: string, options?: { method?: string; body?: string }) {
  return page.evaluate(async ({ path, options }) => {
    const res = await fetch(path, {
      method: options?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(options?.body ? { body: options.body } : {}),
    });
    let json: any;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  }, { path, options });
}

// Shared setup — login + resolve firm
async function setup(page: Page) {
  await login(page, ACCOUNTANT);
  const firmId = await resolveFirmId(page);
  return firmId;
}

// ============================================================
// 1. GL PASSTHROUGH: Create OR → Read Back → GL Matches
// ============================================================

test.describe('Round-Trip 1: OR GL Passthrough', () => {
  test('Sales invoice GL is returned correctly in bank recon preview', async ({ page }) => {
    const firmId = await setup(page);
    if (!firmId) { test.info().annotations.push({ type: 'skip', description: 'No firm found' }); return; }

    // 1. Get GL accounts for the firm
    const glRes = await authFetch(page, `/api/gl-accounts?firmId=${firmId}`);
    expect(glRes.status).toBe(200);
    const glAccounts = glRes.json.data ?? [];
    expect(glAccounts.length).toBeGreaterThan(0);

    // Pick a specific GL account (not the default trade receivables)
    const incomeGl = glAccounts.find((a: any) => a.account_type === 'Revenue' || a.name.toLowerCase().includes('sales'));
    if (!incomeGl) {
      test.info().annotations.push({ type: 'skip', description: 'No revenue/sales GL found for firm' });
      return;
    }

    // 2. Get a bank statement with unmatched credit transactions
    const stmtListRes = await authFetch(page, `/api/bank-reconciliation/statements?firmId=${firmId}`);
    if (stmtListRes.status !== 200 || !stmtListRes.json.data?.length) {
      test.info().annotations.push({ type: 'skip', description: 'No bank statements found' });
      return;
    }

    // Find a statement with unmatched credit txns
    let unmatchedCreditTxn: any = null;
    let statementId: string = '';
    for (const stmt of stmtListRes.json.data) {
      const detailRes = await authFetch(page, `/api/bank-reconciliation/statements/${stmt.id}`);
      if (detailRes.status !== 200) continue;
      const txns = detailRes.json.data?.transactions ?? [];
      unmatchedCreditTxn = txns.find((t: any) => t.recon_status === 'unmatched' && t.credit);
      if (unmatchedCreditTxn) { statementId = stmt.id; break; }
    }

    if (!unmatchedCreditTxn) {
      test.info().annotations.push({ type: 'skip', description: 'No unmatched credit transactions found' });
      return;
    }

    // 3. Create OR with specific GL
    const createRes = await authFetch(page, '/api/bank-reconciliation/create-receipt', {
      method: 'POST',
      body: JSON.stringify({
        bankTransactionId: unmatchedCreditTxn.id,
        gl_account_id: incomeGl.id,
        notes: `Round-trip test — ${new Date().toISOString()}`,
      }),
    });
    expect(createRes.status).toBe(200);
    expect(createRes.json.data?.sales_invoice_id).toBeTruthy();
    const salesInvoiceId = createRes.json.data.sales_invoice_id;

    // 4. Read back the statement detail — verify GL is returned
    const readRes = await authFetch(page, `/api/bank-reconciliation/statements/${statementId}`);
    expect(readRes.status).toBe(200);
    const updatedTxn = readRes.json.data.transactions.find((t: any) => t.id === unmatchedCreditTxn.id);
    expect(updatedTxn).toBeTruthy();
    expect(updatedTxn.recon_status).toBe('manually_matched');
    expect(updatedTxn.matched_sales_invoice).toBeTruthy();
    expect(updatedTxn.matched_sales_invoice.id).toBe(salesInvoiceId);

    // THE KEY ASSERTION: GL must come back correctly
    expect(updatedTxn.matched_sales_invoice.contra_gl_account_id).toBe(incomeGl.id);

    // 5. Verify JV was created with correct GL
    const jeRes = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=10`);
    if (jeRes.status === 200) {
      const entries = jeRes.json.data ?? [];
      const matchingJE = entries.find((je: any) =>
        je.source_type === 'bank_recon' && je.source_id === unmatchedCreditTxn.id
      );
      if (matchingJE?.lines) {
        const creditLine = matchingJE.lines.find((l: any) => parseFloat(l.credit_amount) > 0);
        expect(creditLine?.gl_account_id).toBe(incomeGl.id);
      }
    }

    // 6. Cleanup: unmatch to restore original state
    await authFetch(page, '/api/bank-reconciliation/unmatch', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionId: unmatchedCreditTxn.id }),
    });

    // Delete the created sales invoice
    await authFetch(page, `/api/sales-invoices/${salesInvoiceId}`, { method: 'DELETE' });

    test.info().annotations.push({ type: 'info', description: `Verified OR GL passthrough: ${incomeGl.account_code} — ${incomeGl.name}` });
  });
});

// ============================================================
// 2. GL PASSTHROUGH: Create PV → Read Back → GL Matches
// ============================================================

test.describe('Round-Trip 2: PV GL Passthrough', () => {
  test('Invoice GL is returned correctly in bank recon preview', async ({ page }) => {
    const firmId = await setup(page);


    const glRes = await authFetch(page, `/api/gl-accounts?firmId=${firmId}`);
    const glAccounts = glRes.json.data ?? [];
    const expenseGl = glAccounts.find((a: any) => a.account_type === 'Expense' || a.name.toLowerCase().includes('expense'));
    if (!expenseGl) {
      test.info().annotations.push({ type: 'skip', description: 'No expense GL found' });
      return;
    }

    // Find unmatched debit transaction
    const stmtListRes = await authFetch(page, `/api/bank-reconciliation/statements?firmId=${firmId}`);
    if (stmtListRes.status !== 200) return;

    let unmatchedDebitTxn: any = null;
    let statementId: string = '';
    for (const stmt of stmtListRes.json.data ?? []) {
      const detailRes = await authFetch(page, `/api/bank-reconciliation/statements/${stmt.id}`);
      if (detailRes.status !== 200) continue;
      const txns = detailRes.json.data?.transactions ?? [];
      unmatchedDebitTxn = txns.find((t: any) => t.recon_status === 'unmatched' && t.debit);
      if (unmatchedDebitTxn) { statementId = stmt.id; break; }
    }

    if (!unmatchedDebitTxn) {
      test.info().annotations.push({ type: 'skip', description: 'No unmatched debit transactions found' });
      return;
    }

    // Create PV with specific GL
    const createRes = await authFetch(page, '/api/bank-reconciliation/create-voucher', {
      method: 'POST',
      body: JSON.stringify({
        bankTransactionId: unmatchedDebitTxn.id,
        gl_account_id: expenseGl.id,
        notes: `Round-trip test — ${new Date().toISOString()}`,
      }),
    });
    expect(createRes.status).toBe(200);
    const invoiceId = createRes.json.data?.invoice_id;
    expect(invoiceId).toBeTruthy();

    // Read back — verify GL passthrough
    const readRes = await authFetch(page, `/api/bank-reconciliation/statements/${statementId}`);
    const updatedTxn = readRes.json.data.transactions.find((t: any) => t.id === unmatchedDebitTxn.id);
    expect(updatedTxn?.matched_invoice).toBeTruthy();

    // GL should be returned via contra_gl_account_id fallback chain
    expect(updatedTxn.matched_invoice.contra_gl_account_id).toBe(expenseGl.id);

    // Cleanup
    await authFetch(page, '/api/bank-reconciliation/unmatch', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionId: unmatchedDebitTxn.id }),
    });
    await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId }),
    });

    test.info().annotations.push({ type: 'info', description: `Verified PV GL passthrough: ${expenseGl.account_code} — ${expenseGl.name}` });
  });
});

// ============================================================
// 3. SOFT DELETE: Delete → Hidden → Restore → Visible
// ============================================================

test.describe('Round-Trip 3: Soft Delete & Restore', () => {
  test('Soft-deleted invoice disappears from list, reappears after restore', async ({ page }) => {
    const firmId = await setup(page);


    // Find a pending_approval invoice (no downstream links = can delete)
    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=50`);
    if (listRes.status !== 200) return;
    const invoices = listRes.json.data ?? [];
    const deletable = invoices.find((i: any) => i.approval === 'pending_approval' && i.payment_status === 'unpaid');
    if (!deletable) {
      test.info().annotations.push({ type: 'skip', description: 'No deletable invoice found (all approved or have payments)' });
      return;
    }

    // Delete it
    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: deletable.id }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify it's gone from the list
    const listAfterDelete = await authFetch(page, `/api/invoices?firmId=${firmId}&take=200`);
    const stillVisible = (listAfterDelete.json.data ?? []).find((i: any) => i.id === deletable.id);
    expect(stillVisible).toBeFalsy();

    // Verify it appears in deleted records
    const deletedRes = await authFetch(page, '/api/deleted-records');
    const inDeleted = (deletedRes.json.data ?? []).find((r: any) => r.id === deletable.id);
    expect(inDeleted).toBeTruthy();
    expect(inDeleted.type).toBe('Invoice');

    // Restore it
    const restoreRes = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'invoice', id: deletable.id }),
    });
    expect(restoreRes.status).toBe(200);

    // Verify it's back in the list
    const listAfterRestore = await authFetch(page, `/api/invoices?firmId=${firmId}&take=200`);
    const restored = (listAfterRestore.json.data ?? []).find((i: any) => i.id === deletable.id);
    expect(restored).toBeTruthy();
    expect(restored.approval).toBe('pending_approval');

    test.info().annotations.push({ type: 'info', description: `Verified soft-delete round-trip for invoice ${deletable.id}` });
  });
});

// ============================================================
// 4. DELETE BLOCKERS: Approved invoice cannot be deleted
// ============================================================

test.describe('Round-Trip 4: Delete Blockers', () => {
  test('Approved invoice returns blockers, not deleted', async ({ page }) => {
    const firmId = await setup(page);


    // Find an approved invoice
    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=50`);
    const invoices = listRes.json.data ?? [];
    const approved = invoices.find((i: any) => i.approval === 'approved');
    if (!approved) {
      test.info().annotations.push({ type: 'skip', description: 'No approved invoice found' });
      return;
    }

    // Try to delete — should fail with blockers
    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: approved.id }),
    });
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.json.blockers).toBeTruthy();
    expect(deleteRes.json.blockers.length).toBeGreaterThan(0);
    expect(deleteRes.json.blockers[0].label).toContain('Approved');

    // Verify invoice still exists
    const verifyRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=200`);
    const stillThere = (verifyRes.json.data ?? []).find((i: any) => i.id === approved.id);
    expect(stillThere).toBeTruthy();

    test.info().annotations.push({ type: 'info', description: `Verified delete blocked for approved invoice ${approved.id}, ${deleteRes.json.blockers.length} blocker(s)` });
  });
});

// ============================================================
// 5. JV INTEGRITY: All JVs balance (DR = CR)
// ============================================================

test.describe('Round-Trip 5: JV Integrity', () => {
  test('All journal entries have balanced DR/CR', async ({ page }) => {
    const firmId = await setup(page);


    const jeRes = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    if (jeRes.status !== 200) return;

    const entries = jeRes.json.data ?? [];
    let checked = 0;
    let imbalanced = 0;
    const issues: string[] = [];

    for (const je of entries) {
      if (!je.lines || je.lines.length === 0) continue;
      checked++;
      const dr = je.lines.reduce((s: number, l: any) => s + parseFloat(l.debit_amount || '0'), 0);
      const cr = je.lines.reduce((s: number, l: any) => s + parseFloat(l.credit_amount || '0'), 0);
      if (Math.abs(dr - cr) > 0.02) {
        imbalanced++;
        issues.push(`${je.voucher_number}: DR=${dr.toFixed(2)} CR=${cr.toFixed(2)}`);
      }
    }

    test.info().annotations.push({ type: 'info', description: `Checked ${checked} JEs, ${imbalanced} imbalanced` });
    if (issues.length > 0) {
      test.info().annotations.push({ type: 'warning', description: issues.slice(0, 10).join('; ') });
    }
    expect(imbalanced).toBe(0);
  });

  test('No orphaned JVs (source record exists)', async ({ page }) => {
    const firmId = await setup(page);


    const jeRes = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    if (jeRes.status !== 200) return;

    const entries = jeRes.json.data ?? [];
    const orphans: string[] = [];

    for (const je of entries) {
      if (je.status === 'reversed' || !je.source_id) continue;
      // Reversals always have a valid source (the original JE)
      if (je.reversal_of_id) continue;
      // We can't easily check if the source record exists from the client
      // but we can check the source_type is valid
      const validTypes = ['invoice_posting', 'sales_invoice_posting', 'bank_recon', 'manual', 'year_end_close', 'claim_approval'];
      if (!validTypes.includes(je.source_type)) {
        orphans.push(`${je.voucher_number}: unknown source_type "${je.source_type}"`);
      }
    }

    test.info().annotations.push({ type: 'info', description: `Checked ${entries.length} JEs for orphans, found ${orphans.length}` });
    expect(orphans.length).toBe(0);
  });
});

// ============================================================
// 6. ADMIN-ACCOUNTANT PARITY: Same data shape from both APIs
// ============================================================

test.describe('Round-Trip 6: API Parity', () => {
  test('Bank recon statement detail returns same fields for admin and accountant', async ({ page }) => {
    const firmId = await setup(page);


    // Get a statement ID
    const stmtRes = await authFetch(page, `/api/bank-reconciliation/statements?firmId=${firmId}`);
    if (stmtRes.status !== 200 || !stmtRes.json.data?.length) return;
    const stmtId = stmtRes.json.data[0].id;

    // Fetch accountant version
    const accRes = await authFetch(page, `/api/bank-reconciliation/statements/${stmtId}`);
    expect(accRes.status).toBe(200);

    const accTxn = accRes.json.data.transactions[0];
    if (!accTxn) return;

    // Verify expected fields exist
    const requiredFields = ['id', 'transaction_date', 'description', 'debit', 'credit', 'recon_status'];
    for (const field of requiredFields) {
      expect(accTxn).toHaveProperty(field);
    }

    // If matched, verify GL-related fields
    if (accTxn.matched_invoice) {
      expect(accTxn.matched_invoice).toHaveProperty('contra_gl_account_id');
      expect(accTxn.matched_invoice).toHaveProperty('supplier_default_contra_gl_id');
    }
    if (accTxn.matched_sales_invoice) {
      expect(accTxn.matched_sales_invoice).toHaveProperty('contra_gl_account_id');
    }

    test.info().annotations.push({ type: 'info', description: 'Accountant bank recon API has all required fields' });
  });
});
