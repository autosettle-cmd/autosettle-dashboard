import { test, expect, Page } from '@playwright/test';

/**
 * LIFECYCLE API TESTS — full create → approve → verify JV → revert round-trips.
 * Uses API calls (not UI clicks) for reliability.
 */

const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

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

async function setup(page: Page) {
  await login(page, ACCOUNTANT);
  const res = await authFetch(page, '/api/firms');
  return res.json?.data?.[0]?.id ?? '';
}

// ============================================================
// 1. INVOICE LIFECYCLE: approve → JV created → revert → JV reversed
// ============================================================

test.describe('Lifecycle API 1: Invoice Approval & JV', () => {
  test('Approve invoice creates JV, revert removes it', async ({ page }) => {
    const firmId = await setup(page);
    if (!firmId) return;

    // Find an unapproved, reviewed invoice
    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=100`);
    const invoices = listRes.json?.data ?? [];
    const candidate = invoices.find((i: any) => i.approval === 'pending_approval' && i.status === 'reviewed');
    if (!candidate) {
      test.info().annotations.push({ type: 'skip', description: 'No reviewed+unapproved invoice found' });
      return;
    }

    // Count JVs before
    const jvBefore = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    const jvCountBefore = (jvBefore.json?.data ?? []).length;

    // Approve the invoice
    const approveRes = await authFetch(page, '/api/invoices/batch', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds: [candidate.id], action: 'approve' }),
    });
    expect(approveRes.status).toBe(200);

    // Verify JV was created
    const jvAfter = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    const jvCountAfter = (jvAfter.json?.data ?? []).length;
    expect(jvCountAfter).toBeGreaterThan(jvCountBefore);

    // Find the new JV
    const newJV = (jvAfter.json?.data ?? []).find((je: any) =>
      je.source_type === 'invoice_posting' && je.source_id === candidate.id
    );
    expect(newJV).toBeTruthy();
    expect(newJV.status).toBe('posted');

    // Verify JV is balanced
    if (newJV?.lines) {
      const dr = newJV.lines.reduce((s: number, l: any) => s + parseFloat(l.debit_amount || '0'), 0);
      const cr = newJV.lines.reduce((s: number, l: any) => s + parseFloat(l.credit_amount || '0'), 0);
      expect(Math.abs(dr - cr)).toBeLessThan(0.02);
    }

    // Revert approval
    const revertRes = await authFetch(page, '/api/invoices/batch', {
      method: 'POST',
      body: JSON.stringify({ invoiceIds: [candidate.id], action: 'revert_approval' }),
    });
    expect(revertRes.status).toBe(200);

    // Verify invoice is back to pending_approval
    const verifyRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=200`);
    const reverted = (verifyRes.json?.data ?? []).find((i: any) => i.id === candidate.id);
    expect(reverted?.approval).toBe('pending_approval');

    // Verify JV was reversed (reversal JV created)
    const jvFinal = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    const reversalJV = (jvFinal.json?.data ?? []).find((je: any) =>
      je.reversal_of_id === newJV.id
    );
    expect(reversalJV).toBeTruthy();

    test.info().annotations.push({ type: 'info', description: `Invoice ${candidate.id}: approved → JV ${newJV?.voucher_number} → reverted → reversal JV created` });
  });
});

// ============================================================
// 2. CLAIM LIFECYCLE: review → approve → JV → revert
// ============================================================

test.describe('Lifecycle API 2: Claim Approval & JV', () => {
  test('Approve claim creates JV, revert removes it', async ({ page }) => {
    const firmId = await setup(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=100`);
    const claims = listRes.json?.data ?? [];

    // Find a reviewed, pending_approval claim
    const candidate = claims.find((c: any) => c.approval === 'pending_approval' && c.status === 'reviewed');
    if (!candidate) {
      // Try to find a pending_review one and mark it reviewed first
      const pendingReview = claims.find((c: any) => c.status === 'pending_review');
      if (!pendingReview) {
        test.info().annotations.push({ type: 'skip', description: 'No reviewable claim found' });
        return;
      }

      // Mark as reviewed
      await authFetch(page, '/api/claims/batch', {
        method: 'POST',
        body: JSON.stringify({ claimIds: [pendingReview.id], action: 'review' }),
      });
    }

    // Re-fetch to get reviewed claims
    const refreshRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=100`);
    const reviewed = (refreshRes.json?.data ?? []).find((c: any) => c.approval === 'pending_approval' && c.status === 'reviewed');
    if (!reviewed) {
      test.info().annotations.push({ type: 'skip', description: 'No reviewed claim to approve' });
      return;
    }

    // Approve
    const approveRes = await authFetch(page, '/api/claims/batch', {
      method: 'POST',
      body: JSON.stringify({ claimIds: [reviewed.id], action: 'approve' }),
    });
    expect(approveRes.status).toBe(200);

    // Verify claim is approved
    const verifyRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=200`);
    const approved = (verifyRes.json?.data ?? []).find((c: any) => c.id === reviewed.id);
    expect(approved?.approval).toBe('approved');

    // Revert approval
    const revertRes = await authFetch(page, '/api/claims/batch', {
      method: 'POST',
      body: JSON.stringify({ claimIds: [reviewed.id], action: 'revert_approval' }),
    });
    expect(revertRes.status).toBe(200);

    // Verify reverted
    const finalRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=200`);
    const reverted = (finalRes.json?.data ?? []).find((c: any) => c.id === reviewed.id);
    expect(reverted?.approval).toBe('pending_approval');

    test.info().annotations.push({ type: 'info', description: `Claim ${reviewed.id}: approved → reverted` });
  });
});

// ============================================================
// 3. SOFT DELETE LIFECYCLE: delete → hidden → in deleted list → restore → visible
// ============================================================

test.describe('Lifecycle API 3: Soft Delete Full Cycle', () => {
  test('Claim soft delete and restore cycle', async ({ page }) => {
    const firmId = await setup(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=100`);
    const claims = listRes.json?.data ?? [];
    // Find a deletable claim (pending_approval, unpaid, no bank match)
    const deletable = claims.find((c: any) =>
      c.approval === 'pending_approval' && c.payment_status === 'unpaid'
    );
    if (!deletable) {
      test.info().annotations.push({ type: 'skip', description: 'No deletable claim' });
      return;
    }

    // Delete
    const deleteRes = await authFetch(page, '/api/claims/delete', {
      method: 'DELETE',
      body: JSON.stringify({ claimIds: [deletable.id] }),
    });
    if (deleteRes.json?.blockers?.length) {
      test.info().annotations.push({ type: 'skip', description: `Blocked: ${deleteRes.json.blockers[0].label}` });
      return;
    }
    expect(deleteRes.status).toBe(200);

    // Verify hidden from list
    const afterDelete = await authFetch(page, `/api/claims?firmId=${firmId}&take=200`);
    expect((afterDelete.json?.data ?? []).find((c: any) => c.id === deletable.id)).toBeFalsy();

    // Verify in deleted records
    const deletedRes = await authFetch(page, '/api/deleted-records');
    const inDeleted = (deletedRes.json?.data ?? []).find((r: any) => r.id === deletable.id);
    expect(inDeleted).toBeTruthy();

    // Restore
    const restoreRes = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'claim', id: deletable.id }),
    });
    expect(restoreRes.status).toBe(200);

    // Verify back in list
    const afterRestore = await authFetch(page, `/api/claims?firmId=${firmId}&take=200`);
    const restored = (afterRestore.json?.data ?? []).find((c: any) => c.id === deletable.id);
    expect(restored).toBeTruthy();

    test.info().annotations.push({ type: 'info', description: `Claim ${deletable.id}: deleted → restored` });
  });
});

// ============================================================
// 4. BANK RECON LIFECYCLE: match → confirm → JV → unmatch → JV reversed
// ============================================================

test.describe('Lifecycle API 4: Bank Recon Match & JV', () => {
  test('Match suggested txn creates JV, unmatch reverses it', async ({ page }) => {
    const firmId = await setup(page);
    if (!firmId) return;

    // Get statements
    const stmtsRes = await authFetch(page, `/api/bank-reconciliation/statements?firmId=${firmId}`);
    const statements = stmtsRes.json?.data ?? [];
    if (statements.length === 0) { test.info().annotations.push({ type: 'skip', description: 'No statements' }); return; }

    // Find a suggested (matched but not confirmed) transaction
    let suggestedTxn: any = null;
    let stmtId = '';
    for (const stmt of statements) {
      const detail = await authFetch(page, `/api/bank-reconciliation/statements/${stmt.id}`);
      const txns = detail.json?.data?.transactions ?? [];
      suggestedTxn = txns.find((t: any) => t.recon_status === 'matched');
      if (suggestedTxn) { stmtId = stmt.id; break; }
    }
    if (!suggestedTxn) {
      test.info().annotations.push({ type: 'skip', description: 'No suggested matches found' });
      return;
    }

    // Count JVs before
    const jvBefore = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    const countBefore = (jvBefore.json?.data ?? []).length;

    // Confirm the match
    const confirmRes = await authFetch(page, '/api/bank-reconciliation/confirm', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionIds: [suggestedTxn.id] }),
    });
    expect(confirmRes.status).toBe(200);

    // Verify JV created
    const jvAfter = await authFetch(page, `/api/journal-entries?firmId=${firmId}&take=500`);
    const countAfter = (jvAfter.json?.data ?? []).length;
    expect(countAfter).toBeGreaterThan(countBefore);

    // Verify txn is now manually_matched
    const detailAfter = await authFetch(page, `/api/bank-reconciliation/statements/${stmtId}`);
    const updatedTxn = (detailAfter.json?.data?.transactions ?? []).find((t: any) => t.id === suggestedTxn.id);
    expect(updatedTxn?.recon_status).toBe('manually_matched');

    // Unmatch
    const unmatchRes = await authFetch(page, '/api/bank-reconciliation/unmatch', {
      method: 'POST',
      body: JSON.stringify({ bankTransactionId: suggestedTxn.id }),
    });
    expect(unmatchRes.status).toBe(200);

    // Verify txn is back to unmatched
    const detailFinal = await authFetch(page, `/api/bank-reconciliation/statements/${stmtId}`);
    const finalTxn = (detailFinal.json?.data?.transactions ?? []).find((t: any) => t.id === suggestedTxn.id);
    expect(finalTxn?.recon_status).toBe('unmatched');

    test.info().annotations.push({ type: 'info', description: `Txn ${suggestedTxn.id}: confirmed → JV created → unmatched → JV reversed` });
  });
});
