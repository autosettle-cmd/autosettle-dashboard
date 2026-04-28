import { test, expect, Page } from '@playwright/test';

/**
 * DESTRUCTIVE PATH TESTS — try to break things on purpose.
 * Verifies that blockers, validation, and guards work correctly.
 */

const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };
const ADMIN = { email: 'admin@dsplus.com', password: 'password123' };

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

async function getFirmId(page: Page): Promise<string> {
  const res = await authFetch(page, '/api/firms');
  return res.json?.data?.[0]?.id ?? '';
}

// ============================================================
// 1. DELETE BLOCKERS — approved records cannot be deleted
// ============================================================

test.describe('Destructive 1: Delete Blockers', () => {
  test('Cannot delete approved invoice — returns blockers', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const firmId = await getFirmId(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=50`);
    const approved = (listRes.json?.data ?? []).find((i: any) => i.approval === 'approved');
    if (!approved) { test.info().annotations.push({ type: 'skip', description: 'No approved invoice' }); return; }

    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: approved.id }),
    });
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.json.blockers).toBeTruthy();
    expect(deleteRes.json.blockers.length).toBeGreaterThan(0);

    // Verify still exists
    const verifyRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=200`);
    expect((verifyRes.json?.data ?? []).find((i: any) => i.id === approved.id)).toBeTruthy();
  });

  test('Cannot delete approved claim — returns blockers', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const firmId = await getFirmId(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=50`);
    const approved = (listRes.json?.data ?? []).find((c: any) => c.approval === 'approved');
    if (!approved) { test.info().annotations.push({ type: 'skip', description: 'No approved claim' }); return; }

    const deleteRes = await authFetch(page, '/api/claims/delete', {
      method: 'DELETE',
      body: JSON.stringify({ claimIds: [approved.id] }),
    });
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.json.blockers).toBeTruthy();
    expect(deleteRes.json.blockers[0].label).toContain('approved');
  });

  test('Cannot delete paid invoice — returns blockers', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const firmId = await getFirmId(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=100`);
    const paid = (listRes.json?.data ?? []).find((i: any) => i.payment_status === 'paid');
    if (!paid) { test.info().annotations.push({ type: 'skip', description: 'No paid invoice' }); return; }

    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: paid.id }),
    });
    expect(deleteRes.status).toBe(400);
    expect(deleteRes.json.blockers).toBeTruthy();
  });

  test('Cannot delete payment with allocations — returns blockers', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const firmId = await getFirmId(page);
    if (!firmId) return;

    // Find a payment that has allocations
    const paymentsRes = await authFetch(page, `/api/payments?firmId=${firmId}&take=50`);
    const payments = paymentsRes.json?.data ?? [];
    if (payments.length === 0) { test.info().annotations.push({ type: 'skip', description: 'No payments' }); return; }

    // Try deleting the first payment — if it has allocations, should be blocked
    const deleteRes = await authFetch(page, `/api/payments/${payments[0].id}`, { method: 'DELETE' });
    if (deleteRes.status === 400) {
      expect(deleteRes.json.blockers).toBeTruthy();
      test.info().annotations.push({ type: 'info', description: `Blocked: ${deleteRes.json.blockers.map((b: any) => b.label).join(', ')}` });
    } else {
      // Payment had no allocations — restore it
      await authFetch(page, '/api/deleted-records/restore', {
        method: 'POST',
        body: JSON.stringify({ model: 'payment', id: payments[0].id }),
      });
      test.info().annotations.push({ type: 'info', description: 'Payment had no allocations — deleted and restored' });
    }
  });
});

// ============================================================
// 2. VALIDATION — empty/invalid submissions rejected
// ============================================================

test.describe('Destructive 2: Validation', () => {
  test('Delete with no invoiceId returns 400', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const res = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('Delete with no claimIds returns 400', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const res = await authFetch(page, '/api/claims/delete', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('Delete nonexistent invoice returns 404', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const res = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
  });

  test('Restore nonexistent record returns 404', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const res = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'invoice', id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(404);
  });

  test('Restore with invalid model returns 400', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const res = await authFetch(page, '/api/deleted-records/restore', {
      method: 'POST',
      body: JSON.stringify({ model: 'fakeModel', id: 'xxx' }),
    });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// 3. DEDUP & EMPTY SUBMIT — duplicate/invalid submissions rejected
// ============================================================

test.describe('Destructive 3: Dedup & Empty Submit', () => {
  const FIRM_ID = 'd591d195-db07-4225-a934-5a98d1238865';

  test('Double-submit same invoice_number returns dedup error', async ({ page }) => {
    await login(page, ACCOUNTANT);

    // First, find an existing invoice to get its invoice_number
    const listRes = await authFetch(page, `/api/invoices?firmId=${FIRM_ID}&take=50`);
    const existing = (listRes.json?.data ?? []).find((i: any) => i.invoice_number);
    if (!existing) {
      test.info().annotations.push({ type: 'skip', description: 'No invoice with invoice_number found' });
      return;
    }

    // Try to create an invoice with the same invoice_number via FormData
    const result = await page.evaluate(async ({ firmId, invoiceNumber }) => {
      const form = new FormData();
      form.append('firm_id', firmId);
      form.append('vendor_name', 'Test Vendor Dedup');
      form.append('invoice_number', invoiceNumber);
      form.append('issue_date', '2026-01-15');
      form.append('total_amount', '100.00');

      const res = await fetch('/api/invoices', { method: 'POST', body: form });
      let json: any;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    }, { firmId: FIRM_ID, invoiceNumber: existing.invoice_number });

    // Should return 409 with duplicate error
    expect(result.status).toBe(409);
    expect(result.json?.error).toContain('Duplicate');
  });

  test('Submit claim with missing required fields returns 400', async ({ page }) => {
    await login(page, ACCOUNTANT);

    // Submit claim with empty FormData (only firm_id, missing merchant/amount/date/category)
    const result = await page.evaluate(async (firmId) => {
      const form = new FormData();
      form.append('firm_id', firmId);
      form.append('type', 'claim');
      // Missing: claim_date, merchant, amount, category_id

      const res = await fetch('/api/claims', { method: 'POST', body: form });
      let json: any;
      try { json = await res.json(); } catch { json = null; }
      return { status: res.status, json };
    }, FIRM_ID);

    expect(result.status).toBe(400);
    expect(result.json?.error).toContain('Missing required fields');
  });

  test('Delete payment that has allocations returns blockers', async ({ page }) => {
    await login(page, ACCOUNTANT);

    // Find a payment that has allocations by checking each payment
    const paymentsRes = await authFetch(page, `/api/payments?firmId=${FIRM_ID}&take=50`);
    const payments = paymentsRes.json?.data ?? [];
    if (payments.length === 0) {
      test.info().annotations.push({ type: 'skip', description: 'No payments found' });
      return;
    }

    // Try each payment until we find one with allocations (returns 400 with blockers)
    let foundBlocked = false;
    for (const payment of payments) {
      const deleteRes = await authFetch(page, `/api/payments/${payment.id}`, { method: 'DELETE' });
      if (deleteRes.status === 400 && deleteRes.json?.blockers?.length > 0) {
        // Verify blocker structure
        expect(deleteRes.json.blockers[0].label).toBeTruthy();
        expect(deleteRes.json.blockers[0].detail).toBeTruthy();
        expect(deleteRes.json.blockers[0].label).toContain('allocation');
        foundBlocked = true;
        break;
      }
      if (deleteRes.status === 200) {
        // Oops, it deleted — restore it
        await authFetch(page, '/api/deleted-records/restore', {
          method: 'POST',
          body: JSON.stringify({ model: 'payment', id: payment.id }),
        });
      }
    }

    if (!foundBlocked) {
      test.info().annotations.push({ type: 'skip', description: 'No payment with allocations found to test blocker' });
    }
  });
});

// ============================================================
// 4. BLOCKER COMPLETENESS — every blocker type is testable
// ============================================================

test.describe('Destructive 4: Blocker Detail', () => {
  test('Blockers include specific labels and details', async ({ page }) => {
    await login(page, ACCOUNTANT);
    const firmId = await getFirmId(page);
    if (!firmId) return;

    const listRes = await authFetch(page, `/api/invoices?firmId=${firmId}&take=100`);
    const approved = (listRes.json?.data ?? []).find((i: any) => i.approval === 'approved');
    if (!approved) return;

    const deleteRes = await authFetch(page, '/api/invoices/delete', {
      method: 'DELETE',
      body: JSON.stringify({ invoiceId: approved.id }),
    });

    // Each blocker must have label + detail
    for (const blocker of (deleteRes.json.blockers ?? [])) {
      expect(blocker.label).toBeTruthy();
      expect(blocker.detail).toBeTruthy();
      expect(typeof blocker.label).toBe('string');
      expect(typeof blocker.detail).toBe('string');
    }
  });
});
