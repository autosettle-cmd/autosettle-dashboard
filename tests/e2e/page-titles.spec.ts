import { test, expect, Page } from '@playwright/test';

const ADMIN = { email: 'admin@dsplus.com', password: 'password123' };
const ACCOUNTANT = { email: 'accountant@autosettle.my', password: 'password123' };
const BRAND = 'Fortura';

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto('/');
  if (!page.url().includes('/login') && !page.url().includes('/auth')) return;
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login') && !url.toString().includes('/auth'), { timeout: 10000 });
}

// ============================================================
// Page Title Verification
// Ensures every page sets the browser tab title correctly
// Format: "{Page Name} — {Brand}"
// ============================================================

test.describe('Accountant page titles', () => {
  const pages: [string, string][] = [
    ['/accountant/dashboard', 'Dashboard'],
    ['/accountant/claims', 'Claims'],
    ['/accountant/claims?type=receipt', 'Claims'],
    ['/accountant/invoices', 'Invoices'],
    ['/accountant/invoices/aging', 'Invoice Aging'],
    ['/accountant/suppliers', 'Suppliers'],
    ['/accountant/bank-reconciliation', 'Bank Reconciliation'],
    ['/accountant/clients', 'Clients'],
    ['/accountant/employees', 'Employees'],
    ['/accountant/categories', 'Categories'],
    ['/accountant/admins', 'Admins'],
    ['/accountant/journal-entries', 'Journal Entries'],
    ['/accountant/chart-of-accounts', 'Chart of Accounts'],
    ['/accountant/general-ledger', 'General Ledger'],
    ['/accountant/trial-balance', 'Trial Balance'],
    ['/accountant/profit-loss', 'Profit & Loss'],
    ['/accountant/balance-sheet', 'Balance Sheet'],
    ['/accountant/fiscal-periods', 'Fiscal Periods'],
    ['/accountant/audit-log', 'Audit Log'],
  ];

  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTANT);
  });

  for (const [path, expectedTitle] of pages) {
    test(`${path} → "${expectedTitle} — ${BRAND}"`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(`${expectedTitle} — ${BRAND}`, { timeout: 10000 });
    });
  }
});

test.describe('Admin page titles', () => {
  const pages: [string, string][] = [
    ['/admin/dashboard', 'Dashboard'],
    ['/admin/claims', 'Claims'],
    ['/admin/claims?type=receipt', 'Claims'],
    ['/admin/invoices', 'Invoices'],
    ['/admin/invoices/aging', 'Invoice Aging'],
    ['/admin/suppliers', 'Suppliers'],
    ['/admin/bank-reconciliation', 'Bank Reconciliation'],
    ['/admin/employees', 'Employees'],
    ['/admin/categories', 'Categories'],
    ['/admin/chart-of-accounts', 'Chart of Accounts'],
    ['/admin/fiscal-periods', 'Fiscal Periods'],
    ['/admin/tax-codes', 'Tax Codes'],
    ['/admin/audit-log', 'Audit Log'],
  ];

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  for (const [path, expectedTitle] of pages) {
    test(`${path} → "${expectedTitle} — ${BRAND}"`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(`${expectedTitle} — ${BRAND}`, { timeout: 10000 });
    });
  }
});
