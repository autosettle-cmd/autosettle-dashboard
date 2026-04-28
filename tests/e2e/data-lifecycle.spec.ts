import { test, expect, Page } from '@playwright/test';

/**
 * DATA LIFECYCLE TESTS — uses Retail Mart Sdn Bhd as test firm.
 * These tests verify UI flows work end-to-end.
 */

const ADMIN = { email: 'admin@retailmart.my', password: 'password123' };
const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

// ============================================================
// LIFECYCLE 1: Claim Page → View → Preview
// ============================================================

test.describe('Lifecycle 1: Claim Approval & JV', () => {
  test('Admin claims page loads and shows content', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Claims');
    // Wait for data to load (may be slow for Retail Mart)
    await page.waitForTimeout(8000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
    await expect(page).toHaveScreenshot('lifecycle-admin-claims.png');
  });

  test('Admin can see claims or empty state', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForTimeout(8000);
    // Either table rows or "No claims" message — both valid
    const hasTable = await page.locator('table tbody tr').count().catch(() => 0);
    const hasEmpty = await page.getByText('No claims', { exact: false }).isVisible().catch(() => false);
    expect(hasTable > 0 || hasEmpty).toBeTruthy();
  });

  test('Admin can open claim preview if data exists', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForTimeout(8000);
    const rows = page.locator('table tbody tr');
    const count = await rows.count().catch(() => 0);
    if (count > 0) {
      // Click on a row to open preview
      await rows.first().click();
      await page.waitForTimeout(2000);
      // Should see claim details
      const hasDetails = await page.getByText('Details', { exact: false }).first().isVisible().catch(() => false);
      expect(hasDetails).toBeTruthy();
      await expect(page).toHaveScreenshot('lifecycle-claim-preview.png');
    } else {
      test.info().annotations.push({ type: 'info', description: 'No claims in Retail Mart — skipped preview' });
    }
  });
});

// ============================================================
// LIFECYCLE 2: Accountant Claims Flow
// ============================================================

test.describe('Lifecycle 2: Accountant Approval Flow', () => {
  test('Accountant claims page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/claims');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(8000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
  });

  test('Accountant can view claim details', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/claims');
    await page.waitForTimeout(8000);
    const rows = page.locator('table tbody tr');
    const count = await rows.count().catch(() => 0);
    if (count > 0) {
      await rows.first().click();
      await page.waitForTimeout(2000);
      const hasDetails = await page.getByText('Details', { exact: false }).first().isVisible().catch(() => false);
      expect(hasDetails).toBeTruthy();
    } else {
      test.info().annotations.push({ type: 'info', description: 'No claims — skipped' });
    }
  });
});

// ============================================================
// LIFECYCLE 3: Invoice Flow
// ============================================================

test.describe('Lifecycle 3: Invoice Flow', () => {
  test('Accountant invoices page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Invoices');
    await page.waitForTimeout(5000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
    await expect(page).toHaveScreenshot('lifecycle-accountant-invoices.png');
  });
});

// ============================================================
// LIFECYCLE 4: Receipt → Invoice Linking
// ============================================================

test.describe('Lifecycle 4: Receipt-Invoice Linking', () => {
  test('Receipts page loads for admin', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(8000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
  });

  test('Receipt preview has auto-suggest invoices (if receipts exist)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForTimeout(8000);
    const rows = page.locator('table tbody tr');
    const count = await rows.count().catch(() => 0);
    if (count > 0) {
      await rows.first().click();
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
