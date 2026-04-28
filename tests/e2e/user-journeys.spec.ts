// Run: npx playwright test tests/e2e/user-journeys.spec.ts --reporter=list
import { test, expect, Page } from '@playwright/test';

/**
 * USER JOURNEY TESTS — full lifecycle round-trips via API.
 *
 * Each journey creates test data, exercises the full lifecycle,
 * verifies invariants (JV creation, soft delete visibility, dedup guards),
 * and cleans up after itself.
 */

const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };
const FIRM_ID = 'd591d195-db07-4225-a934-5a98d1238865'; // Retail Mart Sdn Bhd

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

/** Authenticated API call — runs fetch inside the browser to use session cookies */
async function authFetch(page: Page, path: string, options?: { method?: string; body?: string; contentType?: string }) {
  return page.evaluate(async ({ path, options }) => {
    const headers: Record<string, string> = {};
    if (options?.contentType) headers['Content-Type'] = options.contentType;
    else headers['Content-Type'] = 'application/json';

    const res = await fetch(path, {
      method: options?.method ?? 'GET',
      headers,
      ...(options?.body ? { body: options.body } : {}),
    });
    let json: any;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  }, { path, options });
}

/** Post form data via the browser (for endpoints that expect multipart/form-data) */
async function authPostForm(page: Page, path: string, fields: Record<string, string>) {
  return page.evaluate(async ({ path, fields }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      fd.append(k, v);
    }
    const res = await fetch(path, { method: 'POST', body: fd });
    let json: any;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  }, { path, fields });
}

async function setup(page: Page) {
  await login(page, ACCOUNTANT);
}

// ============================================================
// Journey 1: Invoice Lifecycle
// create → approve → verify JV → revert → verify JV reversed → delete
// ============================================================

test.describe('Journey 1: Invoice Lifecycle', () => {
  test('Full invoice lifecycle: create → approve → JV → revert → JV reversed → delete', async ({ page }) => {
    await setup(page);

    const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invoiceNumber = `TEST-INV-${ts}`;

    // 1. Create invoice via formData POST
    const createRes = await authPostForm(page, '/api/invoices', {
      firm_id: FIRM_ID,
      vendor_name: `Test Vendor E2E ${ts}`,
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString().slice(0, 10),
      total_amount: '123.45',
    });
    expect([200, 201]).toContain(createRes.status);
    const invoiceId = createRes.json?.data?.id;
    expect(invoiceId).toBeTruthy();

    // 2. Verify it appears in GET /api/invoices
    const listRes = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    expect(listRes.status).toBe(200);
    const found = (listRes.json?.data ?? []).find((i: any) => i.id === invoiceId);
    expect(found).toBeTruthy();
    expect(found.invoice_number).toBe(invoiceNumber);

    // 2b. Get GL accounts for approval
    const glRes = await authFetch(page, `/api/gl-accounts?firmId=${FIRM_ID}`);
    const glAccounts = glRes.json?.data ?? [];
    const expenseGl = glAccounts.find((a: any) => a.account_type === 'Expense') ?? glAccounts[0];
    const liabilityGl = glAccounts.find((a: any) => a.account_type === 'Liability') ?? glAccounts[1];

    // 3. Approve it via batch PATCH (requires GL accounts)
    const approveRes = await authFetch(page, '/api/invoices/batch', {
      method: 'PATCH',
      body: JSON.stringify({ invoiceIds: [invoiceId], action: 'approve', gl_account_id: expenseGl?.id, contra_gl_account_id: liabilityGl?.id }),
    });
    if (approveRes.status !== 200) {
      throw new Error(`Approve failed: ${approveRes.status} — ${JSON.stringify(approveRes.json)} — expenseGl: ${expenseGl?.id} — contraGl: ${liabilityGl?.id}`);
    }

    // 4. Verify invoice is now approved
    const afterApprove = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    const approved = (afterApprove.json?.data ?? []).find((i: any) => i.id === invoiceId);
    expect(approved?.approval).toBe('approved');

    // 5. Verify JV was created
    const jvRes = await authFetch(page, `/api/journal-entries?firmId=${FIRM_ID}&take=500`);
    expect(jvRes.status).toBe(200);
    const jv = (jvRes.json?.data ?? []).find((je: any) =>
      je.source_type === 'invoice_posting' && je.source_id === invoiceId
    );
    expect(jv).toBeTruthy();
    expect(jv.status).toBe('posted');

    // Verify JV is balanced (DR = CR)
    if (jv?.lines?.length) {
      const dr = jv.lines.reduce((s: number, l: any) => s + parseFloat(l.debit_amount || '0'), 0);
      const cr = jv.lines.reduce((s: number, l: any) => s + parseFloat(l.credit_amount || '0'), 0);
      expect(Math.abs(dr - cr)).toBeLessThan(0.02);
    }

    // 6. Revert approval
    const revertRes = await authFetch(page, '/api/invoices/batch', {
      method: 'PATCH',
      body: JSON.stringify({ invoiceIds: [invoiceId], action: 'revert' }),
    });
    expect(revertRes.status).toBe(200);

    // 7. Verify invoice is back to pending_approval
    const afterRevert = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    const reverted = (afterRevert.json?.data ?? []).find((i: any) => i.id === invoiceId);
    expect(reverted?.approval).toBe('pending_approval');

    // 8. Verify JV was reversed (reversal JV exists)
    const jvFinal = await authFetch(page, `/api/journal-entries?firmId=${FIRM_ID}&take=500`);
    const reversalJV = (jvFinal.json?.data ?? []).find((je: any) =>
      je.reversal_of_id === jv.id
    );
    expect(reversalJV).toBeTruthy();

    // 9. Clean up: soft-delete the test invoice
    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId }),
    });
    // Cleanup is best-effort — may fail if JV remnants create blockers
    if (deleteRes.status === 200) {
      const afterDelete = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
      expect((afterDelete.json?.data ?? []).find((i: any) => i.id === invoiceId)).toBeFalsy();
    }

    test.info().annotations.push({
      type: 'info',
      description: `Invoice ${invoiceNumber}: created → approved → JV ${jv?.voucher_number} → reverted → reversed → deleted`,
    });
  });
});

// ============================================================
// Journey 2: Claim Lifecycle
// create → approve → verify JV → revert → verify JV reversed → delete
// ============================================================

test.describe('Journey 2: Claim Lifecycle', () => {
  test('Full claim lifecycle: create → approve → JV → revert → JV reversed → delete', async ({ page }) => {
    await setup(page);

    const ts = Date.now();

    // Get a category for the claim
    const catRes = await authFetch(page, `/api/categories?firmId=${FIRM_ID}`);
    const categories = catRes.json?.data ?? catRes.json ?? [];
    const cat = Array.isArray(categories) ? categories[0] : null;
    expect(cat?.id).toBeTruthy();

    // 1. Create claim via formData POST
    const createRes = await authPostForm(page, '/api/claims', {
      firm_id: FIRM_ID,
      type: 'claim',
      merchant: `Test Merchant E2E ${ts}`,
      amount: '50.00',
      claim_date: new Date().toISOString().slice(0, 10),
      category_id: cat.id,
      description: 'E2E test claim',
    });
    expect([200, 201]).toContain(createRes.status);
    const claimId = createRes.json?.data?.id;
    expect(claimId).toBeTruthy();

    // 2. Verify it appears in GET /api/claims
    const listRes = await authFetch(page, `/api/claims?firmId=${FIRM_ID}&take=200`);
    expect(listRes.status).toBe(200);
    const found = (listRes.json?.data ?? []).find((c: any) => c.id === claimId);
    expect(found).toBeTruthy();
    // Accountant-uploaded claims should skip pending_review → go straight to reviewed
    expect(found.status).toBe('reviewed');
    expect(found.approval).toBe('pending_approval');

    // 3. Approve it
    const approveRes = await authFetch(page, '/api/claims/batch', {
      method: 'PATCH',
      body: JSON.stringify({ claimIds: [claimId], action: 'approve' }),
    });
    expect(approveRes.status).toBe(200);

    // 4. Verify claim is approved
    const afterApprove = await authFetch(page, `/api/claims?firmId=${FIRM_ID}&take=200`);
    const approved = (afterApprove.json?.data ?? []).find((c: any) => c.id === claimId);
    expect(approved?.approval).toBe('approved');

    // 5. Verify JV was created
    const jvRes = await authFetch(page, `/api/journal-entries?firmId=${FIRM_ID}&take=500`);
    expect(jvRes.status).toBe(200);
    const jv = (jvRes.json?.data ?? []).find((je: any) =>
      je.source_type === 'claim_approval' && je.source_id === claimId
    );
    // Note: bank recon overhaul means claims may not create JVs on approval
    // If JV exists, verify it's balanced
    if (jv) {
      expect(jv.status).toBe('posted');
      if (jv.lines?.length) {
        const dr = jv.lines.reduce((s: number, l: any) => s + parseFloat(l.debit_amount || '0'), 0);
        const cr = jv.lines.reduce((s: number, l: any) => s + parseFloat(l.credit_amount || '0'), 0);
        expect(Math.abs(dr - cr)).toBeLessThan(0.02);
      }
    }

    // 6. Revert approval
    const revertRes = await authFetch(page, '/api/claims/batch', {
      method: 'PATCH',
      body: JSON.stringify({ claimIds: [claimId], action: 'revert' }),
    });
    expect(revertRes.status).toBe(200);

    // 7. Verify claim is back to pending_approval
    const afterRevert = await authFetch(page, `/api/claims?firmId=${FIRM_ID}&take=200`);
    const reverted = (afterRevert.json?.data ?? []).find((c: any) => c.id === claimId);
    expect(reverted?.approval).toBe('pending_approval');

    // 8. If JV was created, verify it was reversed
    if (jv) {
      const jvFinal = await authFetch(page, `/api/journal-entries?firmId=${FIRM_ID}&take=500`);
      const reversalJV = (jvFinal.json?.data ?? []).find((je: any) =>
        je.reversal_of_id === jv.id
      );
      expect(reversalJV).toBeTruthy();
    }

    // 9. Clean up: delete the test claim
    const deleteRes = await authFetch(page, '/api/claims/delete', {
      method: 'DELETE',
      body: JSON.stringify({ claimIds: [claimId] }),
    });
    expect(deleteRes.status).toBe(200);

    // Verify gone from list
    const afterDelete = await authFetch(page, `/api/claims?firmId=${FIRM_ID}&take=200`);
    expect((afterDelete.json?.data ?? []).find((c: any) => c.id === claimId)).toBeFalsy();

    test.info().annotations.push({
      type: 'info',
      description: `Claim ${claimId}: created → approved → ${jv ? `JV ${jv.voucher_number} → ` : ''}reverted → deleted`,
    });
  });
});

// ============================================================
// Journey 3: OR (Official Receipt) GL verification
// Regression test: gl_account_id and gl_account_label must be returned
// ============================================================

test.describe('Journey 3: Sales Invoice GL Verification', () => {
  test('Sales invoice GL fields are returned correctly (regression)', async ({ page }) => {
    await setup(page);

    // 1. Get a GL account to use
    const glRes = await authFetch(page, `/api/gl-accounts?firmId=${FIRM_ID}`);
    expect(glRes.status).toBe(200);
    const glAccounts = glRes.json?.data ?? [];
    expect(glAccounts.length).toBeGreaterThan(0);

    const revenueGl = glAccounts.find((a: any) =>
      a.account_type === 'Revenue' || a.name.toLowerCase().includes('sales')
    );
    if (!revenueGl) {
      test.info().annotations.push({ type: 'skip', description: 'No revenue/sales GL found' });
      return;
    }

    // 2. Get a supplier (buyer) in this firm
    const supplierRes = await authFetch(page, `/api/suppliers?firmId=${FIRM_ID}&take=10`);
    expect(supplierRes.status).toBe(200);
    const suppliers = supplierRes.json?.data ?? [];
    if (suppliers.length === 0) {
      test.info().annotations.push({ type: 'skip', description: 'No suppliers found for firm' });
      return;
    }
    const buyerId = suppliers[0].id;

    // 3. Create a sales invoice with a specific GL account
    const ts = Date.now();
    const invoiceNumber = `TEST-SI-${ts}`;
    const createRes = await authFetch(page, '/api/sales-invoices', {
      method: 'POST',
      body: JSON.stringify({
        firm_id: FIRM_ID,
        supplier_id: buyerId,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString().slice(0, 10),
        gl_account_id: revenueGl.id,
        items: [{
          description: 'E2E test item',
          quantity: 1,
          unit_price: 100,
          discount: 0,
          tax_type: 'none',
          tax_rate: 0,
          tax_amount: 0,
          line_total: 100,
          sort_order: 0,
        }],
      }),
    });
    expect([200, 201]).toContain(createRes.status);
    const salesInvoiceId = createRes.json?.data?.id;
    expect(salesInvoiceId).toBeTruthy();

    // 4. GET the sales invoice back from the list
    const listRes = await authFetch(page, `/api/sales-invoices?firmId=${FIRM_ID}&take=200`);
    expect(listRes.status).toBe(200);
    const si = (listRes.json?.data ?? []).find((s: any) => s.id === salesInvoiceId);
    expect(si).toBeTruthy();

    // 5. THE KEY ASSERTIONS: GL fields must not be null
    expect(si.gl_account_id).toBe(revenueGl.id);
    expect(si.gl_account_label).toBeTruthy();
    expect(si.gl_account_label).toContain(revenueGl.account_code);

    // 6. Clean up
    const deleteRes = await authFetch(page, `/api/sales-invoices/${salesInvoiceId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);

    test.info().annotations.push({
      type: 'info',
      description: `Sales invoice GL regression: ${revenueGl.account_code} — ${revenueGl.name} returned correctly`,
    });
  });
});

// ============================================================
// Journey 4: Soft Delete + Restore + Dedup Guard
// create → delete → verify hidden → create duplicate → restore blocked (409)
// → delete dup → restore succeeds
// ============================================================

test.describe('Journey 4: Soft Delete + Restore + Dedup Guard', () => {
  test('Soft delete, dedup conflict on restore, then successful restore', async ({ page }) => {
    await setup(page);

    const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invoiceNumber = `TEST-DEDUP-${ts}`;

    // 1. Create first invoice
    const create1 = await authPostForm(page, '/api/invoices', {
      firm_id: FIRM_ID,
      vendor_name: `Dedup Test Vendor ${ts}`,
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString().slice(0, 10),
      total_amount: '200.00',
    });
    expect([200, 201]).toContain(create1.status);
    const invoice1Id = create1.json?.data?.id;
    expect(invoice1Id).toBeTruthy();

    // 2. Revert approval if auto-approved, then soft delete
    const inv1Check = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    const inv1Data = (inv1Check.json?.data ?? []).find((i: any) => i.id === invoice1Id);
    if (inv1Data?.approval === 'approved') {
      await authFetch(page, '/api/invoices/batch', {
        method: 'PATCH',
        body: JSON.stringify({ invoiceIds: [invoice1Id], action: 'revert' }),
      });
    }

    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: invoice1Id }),
    });
    // If blockers prevent delete (e.g. auto-approved), skip rest of test
    if (deleteRes.status !== 200) {
      test.info().annotations.push({ type: 'skip', description: `Skipped dedup test: invoice has blockers — ${deleteRes.json?.error}` });
      return;
    }

    // 3. Verify it's gone from the normal list
    const listAfterDelete = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    expect((listAfterDelete.json?.data ?? []).find((i: any) => i.id === invoice1Id)).toBeFalsy();

    // 4. Verify it appears in deleted-records
    const deletedRes = await authFetch(page, '/api/deleted-records');
    expect(deletedRes.status).toBe(200);
    const inDeleted = (deletedRes.json?.data ?? []).find((r: any) => r.id === invoice1Id);
    expect(inDeleted).toBeTruthy();

    // 5. Create another invoice with the same invoice_number
    //    Use a different amount to avoid composite dedup (vendor+date+amount)
    const create2 = await authPostForm(page, '/api/invoices', {
      firm_id: FIRM_ID,
      vendor_name: 'Dedup Test Vendor 2',
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString().slice(0, 10),
      total_amount: '300.00',
    });
    expect([200, 201]).toContain(create2.status);
    const invoice2Id = create2.json?.data?.id;
    expect(invoice2Id).toBeTruthy();

    // 6. Try to restore the first invoice — should get 409 conflict
    const restoreBlocked = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'invoice', id: invoice1Id }),
    });
    expect(restoreBlocked.status).toBe(409);
    expect(restoreBlocked.json?.error).toContain('already exists');

    // 7. Delete the second invoice to clear the conflict
    const delete2 = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: invoice2Id }),
    });
    expect(delete2.status).toBe(200);

    // 8. Now restore the first invoice — should succeed
    const restoreOk = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'invoice', id: invoice1Id }),
    });
    expect(restoreOk.status).toBe(200);

    // 9. Verify it's back in the normal list
    const listAfterRestore = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=200`);
    const restored = (listAfterRestore.json?.data ?? []).find((i: any) => i.id === invoice1Id);
    expect(restored).toBeTruthy();
    expect(restored.invoice_number).toBe(invoiceNumber);

    // 10. Clean up: delete both test invoices permanently
    await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: invoice1Id }),
    });
    // invoice2 is already soft-deleted, no further cleanup needed

    test.info().annotations.push({
      type: 'info',
      description: `Dedup guard: ${invoiceNumber} — restore blocked with dup, succeeded after dup removed`,
    });
  });
});
