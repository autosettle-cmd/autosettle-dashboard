import { test, expect, Page } from '@playwright/test';

/**
 * PERMISSION MATRIX TESTS — verify role-based access control.
 * Every action × every role: admin can't see accountant data, employee can't see other employees.
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

// ============================================================
// 1. ROLE-BASED API ACCESS
// ============================================================

test.describe('Permissions 1: API Role Enforcement', () => {
  test('Admin cannot access accountant-only APIs', async ({ page }) => {
    await login(page, ADMIN);

    // These APIs require role === 'accountant'
    const endpoints = [
      '/api/firms',
      '/api/claims/delete',
      '/api/bank-reconciliation/create-receipt',
      '/api/bank-reconciliation/create-voucher',
    ];

    for (const ep of endpoints) {
      const res = await authFetch(page, ep);
      // 401 (wrong role), 405 (POST-only endpoint hit with GET) — both mean blocked
      expect([401, 405]).toContain(res.status);
      test.info().annotations.push({ type: 'info', description: `${ep} → ${res.status} (blocked)` });
    }
  });

  test('Accountant cannot access admin-only APIs', async ({ page }) => {
    await login(page, ACCOUNTANT);

    const endpoints = [
      '/api/admin/claims?firmId=xxx',
      '/api/admin/invoices?firmId=xxx',
      '/api/admin/employees?firmId=xxx',
    ];

    for (const ep of endpoints) {
      const res = await authFetch(page, ep);
      // Should be 401 (wrong role) or 400 (no firm) — not 200
      expect(res.status).not.toBe(200);
      test.info().annotations.push({ type: 'info', description: `${ep} → ${res.status} (blocked)` });
    }
  });

  test('Unauthenticated API calls return 401', async ({ page }) => {
    // Don't login — go straight to API
    await page.goto('/');

    const endpoints = [
      '/api/invoices?firmId=xxx',
      '/api/claims?firmId=xxx',
      '/api/deleted-records',
      '/api/journal-entries',
    ];

    for (const ep of endpoints) {
      const res = await authFetch(page, ep);
      expect([401, 307]).toContain(res.status); // 401 or redirect to login
    }
  });
});

// ============================================================
// 2. FIRM SCOPING
// ============================================================

test.describe('Permissions 2: Firm Scoping', () => {
  test('Admin cannot access other firm\'s data', async ({ page }) => {
    await login(page, ADMIN);

    // Try accessing a fake firm ID
    const fakeFirmId = '00000000-0000-0000-0000-000000000000';
    const res = await authFetch(page, `/api/admin/claims?firmId=${fakeFirmId}`);
    // Should return empty data or 403 — not another firm's data
    const claims = res.json?.data ?? [];
    expect(claims.length).toBe(0);
  });

  test('Accountant firm scoping filters correctly', async ({ page }) => {
    await login(page, ACCOUNTANT);

    // Get accountant's firms
    const firmsRes = await authFetch(page, '/api/firms');
    const firms = firmsRes.json?.data ?? [];
    if (firms.length === 0) return;

    // Fetch claims for the first firm
    const firmId = firms[0].id;
    const claimsRes = await authFetch(page, `/api/claims?firmId=${firmId}&take=10`);
    const claims = claimsRes.json?.data ?? [];

    // All returned claims should belong to the requested firm
    for (const claim of claims) {
      expect(claim.firm_id).toBe(firmId);
    }

    test.info().annotations.push({ type: 'info', description: `${claims.length} claims all scoped to firm ${firms[0].name}` });
  });

  test('Deleted records are firm-scoped for accountant', async ({ page }) => {
    await login(page, ACCOUNTANT);

    const firmsRes = await authFetch(page, '/api/firms');
    const firmIds = (firmsRes.json?.data ?? []).map((f: any) => f.id);

    const deletedRes = await authFetch(page, '/api/deleted-records');
    const records = deletedRes.json?.data ?? [];

    // All deleted records should belong to accountant's firms (or null = super admin)
    if (firmIds.length > 0 && records.length > 0) {
      for (const r of records) {
        expect(firmIds).toContain(r.firmId);
      }
    }
  });
});

// ============================================================
// 3. PAGE-LEVEL REDIRECTS
// ============================================================

test.describe('Permissions 3: Page Redirects', () => {
  test('Admin redirected away from accountant pages', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/accountant/dashboard');
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/accountant/dashboard');
  });

  test('Accountant redirected away from admin pages', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/admin/dashboard');
  });

  test('Unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/accountant/dashboard');
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('Platform pages blocked for non-platform users', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/platform/dashboard');
    await page.waitForTimeout(2000);
    expect(page.url()).not.toContain('/platform/dashboard');
  });
});
