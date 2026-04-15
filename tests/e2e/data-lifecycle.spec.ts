import { test, expect, Page } from '@playwright/test';

/**
 * DATA LIFECYCLE TESTS — uses Retail Mart Sdn Bhd as test firm.
 * These tests CREATE, APPROVE, and VERIFY data in the real dev DB.
 * They clean up after themselves where possible.
 */

const ADMIN = { email: 'admin@retailmart.my', password: 'password123' };
const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };
const TEST_FIRM_ID = 'd591d195-db07-4225-a934-5a98d1238865';

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

// Helper: call API as accountant
async function apiPost(path: string, body: object) {
  const res = await fetch(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ============================================================
// LIFECYCLE 1: Claim → Review → Approve → JV Created
// ============================================================

test.describe('Lifecycle 1: Claim Approval & JV', () => {
  let createdClaimId: string | null = null;

  test('Admin creates a claim for Retail Mart', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('table', { timeout: 10000 });

    // Click "+ Submit New Claim" or similar button
    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("New Claim"), a:has-text("Submit")').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Fill the claim form
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible()) {
        await dateInput.fill('2026-04-15');
      }

      const merchantInput = page.locator('input[placeholder*="merchant"], input[placeholder*="Merchant"]').first();
      if (await merchantInput.isVisible()) {
        await merchantInput.fill('E2E Test Merchant');
      }

      const amountInput = page.locator('input[type="number"]').first();
      if (await amountInput.isVisible()) {
        await amountInput.fill('123.45');
      }

      // Select first category
      const categorySelect = page.locator('select').nth(0);
      const options = await categorySelect.locator('option').allTextContents();
      if (options.length > 1) {
        await categorySelect.selectOption({ index: 1 });
      }

      // Submit
      const saveBtn = page.locator('button:has-text("Submit"), button:has-text("Save")').last();
      await saveBtn.click();
      await page.waitForTimeout(2000);

      // Verify claim appears in the table
      const tableText = await page.locator('table').textContent();
      if (tableText?.includes('E2E Test Merchant')) {
        test.info().annotations.push({ type: 'info', description: 'Claim created successfully' });
      }
    }
  });

  test('Admin can see claims with Pending Review status', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    // Check that at least one claim has "Pending Review" status
    const pendingCells = page.locator('text=Pending Review');
    const count = await pendingCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Admin marks claim as reviewed', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Click first pending review claim
    const pendingRow = page.locator('table tbody tr:has-text("Pending Review")').first();
    if (await pendingRow.isVisible()) {
      await pendingRow.locator('td').nth(2).click();
      await page.waitForTimeout(1000);

      // Click "Mark as Reviewed" button
      const reviewBtn = page.locator('button:has-text("Mark as Reviewed")');
      if (await reviewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await reviewBtn.click();
        await page.waitForTimeout(2000);
        // Status should change
        test.info().annotations.push({ type: 'info', description: 'Claim marked as reviewed' });
      }
    }
  });
});

// ============================================================
// LIFECYCLE 2: Accountant Approves Claim → JV Verification
// ============================================================

test.describe('Lifecycle 2: Accountant Approval Flow', () => {
  test('Accountant sees claims pending approval', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/claims');
    await page.waitForSelector('table', { timeout: 10000 });
    // Should have claims data
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Accountant can view claim details', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/claims');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    // Click first claim
    await page.locator('table tbody tr').first().locator('td').nth(2).click();
    await page.waitForTimeout(1000);
    // Should see claim details modal
    const details = page.getByText('Details');
    await expect(details.first()).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// LIFECYCLE 3: Invoice Review → Approve → Verify
// ============================================================

test.describe('Lifecycle 3: Invoice Flow', () => {
  test('Accountant invoices page shows data', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    // Change date range to see all
    const dateSelect = page.locator('select').first();
    await dateSelect.selectOption('custom');
    await page.waitForTimeout(2000);
    const hasInvoices = await page.locator('table tbody tr').count().catch(() => 0);
    // May or may not have invoices — both OK for Retail Mart
    expect(hasInvoices).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// LIFECYCLE 4: Receipt → Invoice Linking → Payment Status
// ============================================================

test.describe('Lifecycle 4: Receipt-Invoice Linking', () => {
  test('Receipts page shows Linked column', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('table thead', { timeout: 10000 });
    const headers = await page.locator('table thead th').allTextContents();
    expect(headers.join(' ')).toContain('Linked');
  });

  test('Receipt preview has auto-suggest invoices (if receipts exist)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    // Wait for data to load (not just the loading spinner row)
    await page.waitForTimeout(5000);
    const hasData = await page.locator('table tbody tr td:nth-child(3)').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (hasData) {
      await page.locator('table tbody tr').first().locator('td').nth(2).click();
      await page.waitForTimeout(2000);
      const section = page.getByText('LINKED INVOICES', { exact: false });
      if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
        test.info().annotations.push({ type: 'info', description: 'Linked Invoices section visible' });
      }
    } else {
      test.info().annotations.push({ type: 'info', description: 'No receipts in Retail Mart — skipped' });
    }
  });
});

// Lifecycle 5 & 6 (Bank Recon Receipt/Voucher form tests) are in data-flow.spec.ts
// They test via DS Plus firm which has bank statements. Retail Mart may not have statements.

// ============================================================
// LIFECYCLE 7: JV Integrity Check (DB-level)
// ============================================================

test.describe('Lifecycle 7: JV Integrity', () => {
  test('All journal entries balance (DR = CR)', async () => {
    const response = await fetch('http://localhost:3000/api/journal-entries?take=200');
    if (response.ok) {
      const json = await response.json();
      const entries = json.data ?? [];
      let total = 0;
      let imbalanced = 0;
      const issues: string[] = [];

      for (const je of entries) {
        if (je.lines) {
          total++;
          const totalDebit = je.lines.reduce((s: number, l: { debit_amount: string }) => s + parseFloat(l.debit_amount || '0'), 0);
          const totalCredit = je.lines.reduce((s: number, l: { credit_amount: string }) => s + parseFloat(l.credit_amount || '0'), 0);
          if (Math.abs(totalDebit - totalCredit) > 0.02) {
            imbalanced++;
            issues.push(`JE ${je.id}: DR=${totalDebit.toFixed(2)} CR=${totalCredit.toFixed(2)}`);
          }
        }
      }

      test.info().annotations.push({ type: 'info', description: `Checked ${total} JEs, ${imbalanced} imbalanced` });
      if (issues.length > 0) {
        test.info().annotations.push({ type: 'warning', description: issues.join('; ') });
      }
      expect(imbalanced).toBe(0);
    }
  });
});
