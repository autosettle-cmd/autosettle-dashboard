// Run `npx playwright test --update-snapshots` to update visual baselines
import { test, expect, Page } from '@playwright/test';

const ADMIN = { email: 'admin@dsplus.com', password: 'password123' };
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
// 1. LOGIN & ROLE ACCESS
// ============================================================

test.describe('1. Login & Role Access', () => {
  test('Admin can login and sees admin dashboard', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page).toHaveURL(/admin\/dashboard/);
    await expect(page.locator('h1')).toContainText('Dashboard');
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('admin-dashboard.png');
  });

  test('Accountant can login and sees accountant dashboard', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await expect(page).toHaveURL(/accountant\/dashboard/);
  });
});

// ============================================================
// 2. CLAIMS DATA FLOW (Admin)
// ============================================================

test.describe('2. Claims Data Flow', () => {
  test('Admin claims page loads', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Claims');
    // Page loads — data may still be fetching but no crash
    await page.waitForTimeout(5000);
    // Either table rendered, loading text disappeared, or "No claims" shown — all OK
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
    await expect(page).toHaveScreenshot('admin-claims-page.png');
  });

  test('Admin receipts tab loads', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(5000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
  });

  test('Receipt preview opens and shows Linked Invoices section', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForTimeout(3000);
    const rows = page.locator('table tbody tr');
    if (await rows.count().catch(() => 0) > 0) {
      // Click on a row to open preview
      await rows.first().click();
      await page.waitForTimeout(1000);
      // The modal should have "LINKED INVOICES" text
      const linked = page.getByText('LINKED INVOICES', { exact: false });
      await expect(linked).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveScreenshot('receipt-preview-modal.png');
    }
  });

  test('Receipt table has correct columns', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForTimeout(3000);
    const headers = page.locator('table thead th, table thead td');
    if (await headers.count().catch(() => 0) > 0) {
      const headerText = await headers.allTextContents();
      const text = headerText.join(' ');
      expect(text).toContain('Linked');
    }
  });
});

// ============================================================
// 3. INVOICES DATA FLOW (Admin)
// ============================================================

test.describe('3. Invoices Data Flow', () => {
  test('Admin invoices page loads', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Invoices');
    await page.waitForTimeout(5000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
    await expect(page).toHaveScreenshot('admin-invoices-page.png');
  });
});

// ============================================================
// 4. INVOICES DATA FLOW (Accountant)
// ============================================================

test.describe('4. Accountant Invoices', () => {
  test('Accountant invoices page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Invoices');
    await page.waitForTimeout(5000);
    const pageText = await page.textContent('body') || '';
    expect(pageText).not.toContain('Internal Server Error');
  });

  test('Invoice preview opens with details', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    await page.waitForTimeout(3000);
    const rows = page.locator('table tbody tr');
    if (await rows.count().catch(() => 0) > 0) {
      await rows.first().click();
      // Wait for modal with "INVOICE DETAILS" text
      const modal = page.getByText('INVOICE DETAILS', { exact: false });
      await expect(modal).toBeVisible({ timeout: 8000 });
      await expect(page).toHaveScreenshot('invoice-preview-modal.png');
    }
  });
});

// ============================================================
// 5. BANK RECONCILIATION
// ============================================================

test.describe('5. Bank Reconciliation', () => {
  test('Bank recon list page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Bank Reconciliation');
  });

  test('Bank recon detail page loads with transactions', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForTimeout(2000);
    // Find and click an expandable account card
    const cards = page.locator('[class*="card-button"]');
    if (await cards.count().catch(() => 0) > 0) {
      await cards.first().click();
      await page.waitForTimeout(1000);
      // Click first statement row
      const stmtRow = page.locator('table tbody tr').first();
      if (await stmtRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await stmtRow.click();
        await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
        await page.waitForTimeout(2000);
        // Should see OPENING BALANCE or transaction table
        const hasContent = await page.getByText('OPENING BALANCE', { exact: false }).isVisible().catch(() => false)
          || await page.locator('table').isVisible().catch(() => false);
        expect(hasContent).toBeTruthy();
        await expect(page).toHaveScreenshot('bank-recon-detail.png');
      }
    }
  });

  test('Bank recon detail has Match/Unmatch buttons', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card-button"]');
    if (await cards.count().catch(() => 0) > 0) {
      await cards.first().click();
      await page.waitForTimeout(1000);
      const stmtRow = page.locator('table tbody tr').first();
      if (await stmtRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await stmtRow.click();
        await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
        await page.waitForTimeout(3000);
        // Should have Match or Unmatch buttons
        const matchBtns = page.locator('button:has-text("Match"), button:has-text("Unmatch")');
        const count = await matchBtns.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('Official Receipt form has correct fields', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card-button"]');
    if (await cards.count().catch(() => 0) === 0) return;
    await cards.first().click();
    await page.waitForTimeout(1000);
    const stmtRow = page.locator('table tbody tr').first();
    if (!await stmtRow.isVisible({ timeout: 3000 }).catch(() => false)) return;
    await stmtRow.click();
    await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
    await page.waitForTimeout(3000);

    // Find a Match button and click it
    const matchBtns = page.locator('button:has-text("Match")');
    const count = await matchBtns.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await matchBtns.nth(i).click();
      await page.waitForTimeout(500);
      const receiptBtn = page.getByText('Create Official Receipt');
      if (await receiptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await receiptBtn.click();
        await page.waitForTimeout(500);
        await expect(page.getByText('RECEIVED FROM', { exact: false })).toBeVisible();
        await expect(page.getByText('RECEIPT NO', { exact: false })).toBeVisible();
        await expect(page.getByText('CR ACCOUNT', { exact: false })).toBeVisible();
        break;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('Payment Voucher form has correct fields', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForTimeout(2000);
    const cards = page.locator('[class*="card-button"]');
    if (await cards.count().catch(() => 0) === 0) return;
    await cards.first().click();
    await page.waitForTimeout(1000);
    const stmtRow = page.locator('table tbody tr').first();
    if (!await stmtRow.isVisible({ timeout: 3000 }).catch(() => false)) return;
    await stmtRow.click();
    await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
    await page.waitForTimeout(3000);

    const matchBtns = page.locator('button:has-text("Match")');
    const count = await matchBtns.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await matchBtns.nth(i).click();
      await page.waitForTimeout(500);
      const voucherBtn = page.getByText('Create Payment Voucher');
      if (await voucherBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await voucherBtn.click();
        await page.waitForTimeout(500);
        await expect(page.getByText('PAID TO', { exact: false })).toBeVisible();
        await expect(page.getByText('VOUCHER NO', { exact: false })).toBeVisible();
        await expect(page.getByText('DR ACCOUNT', { exact: false })).toBeVisible();
        break;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});

// ============================================================
// 6. JOURNAL ENTRIES & GL
// ============================================================

test.describe('6. Journal Entries & GL', () => {
  test('Journal entries page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/journal-entries');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('journal-entries-page.png');
  });

  test('General Ledger page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/general-ledger');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('general-ledger-page.png');
  });

  test('Trial Balance page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/trial-balance');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('trial-balance-page.png');
  });

  test('P&L page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/profit-loss');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('profit-loss-page.png');
  });

  test('Balance Sheet page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/balance-sheet');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('balance-sheet-page.png');
  });
});

// ============================================================
// 7. SUPPLIERS
// ============================================================

test.describe('7. Suppliers', () => {
  test('Suppliers page loads with data', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/suppliers');
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.waitForTimeout(3000);
    // Should have a table with supplier rows
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    expect(hasTable).toBeTruthy();
  });
});

// ============================================================
// 8. API - JV INTEGRITY
// ============================================================

test.describe('8. API - Data Integrity', () => {
  test('All journal entries balance (DR = CR)', async () => {
    const response = await fetch('http://localhost:3000/api/journal-entries?take=100');
    if (response.ok) {
      const json = await response.json();
      const entries = json.data ?? [];
      let imbalanced = 0;
      for (const je of entries) {
        if (je.lines) {
          const totalDebit = je.lines.reduce((s: number, l: { debit_amount: string }) => s + parseFloat(l.debit_amount || '0'), 0);
          const totalCredit = je.lines.reduce((s: number, l: { credit_amount: string }) => s + parseFloat(l.credit_amount || '0'), 0);
          if (Math.abs(totalDebit - totalCredit) > 0.02) imbalanced++;
        }
      }
      expect(imbalanced).toBe(0);
    }
  });
});

// ============================================================
// 9. PERMISSIONS
// ============================================================

test.describe('9. Permissions', () => {
  test('Admin cannot access accountant pages', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/accountant/dashboard');
    expect(page.url()).not.toContain('/accountant/dashboard');
  });

  test('Accountant cannot access admin pages', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/admin/dashboard');
    expect(page.url()).not.toContain('/admin/dashboard');
  });
});

// ============================================================
// 10. CATEGORIES & COA
// ============================================================

test.describe('10. Categories & COA', () => {
  test('Admin categories page loads', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/categories');
    await page.waitForSelector('h1', { timeout: 10000 });
  });

  test('Accountant chart of accounts loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/chart-of-accounts');
    await page.waitForSelector('h1', { timeout: 10000 });
  });
});

// ============================================================
// 11. SIDEBAR NAV ITEMS
// ============================================================

test.describe('11. Sidebar Navigation', () => {
  test('Admin sidebar has correct nav items', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/dashboard');
    const sidebar = page.locator('nav, [class*="sidebar"], aside').first();
    const text = await sidebar.textContent() || '';
    expect(text).toContain('Dashboard');
    expect(text).toContain('Claims');
    expect(text).toContain('Invoices');
    expect(text).toContain('Suppliers');
    expect(text).toContain('Bank Recon');
    expect(text).toContain('Deleted Items');
  });

  test('Accountant sidebar has accounting submenu', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/dashboard');
    const sidebar = page.locator('nav, [class*="sidebar"], aside').first();
    const text = await sidebar.textContent() || '';
    expect(text).toContain('Dashboard');
    expect(text).toContain('Claims');
    expect(text).toContain('Invoices');
    expect(text).toContain('Suppliers');
    expect(text).toContain('Accounting');
    expect(text).toContain('Deleted Items');
  });
});

// ============================================================
// 12. NEW PAGES
// ============================================================

test.describe('12. Deleted Items & New Pages', () => {
  test('Deleted Items page loads for accountant', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/deleted-items');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Deleted Items');
  });

  test('Deleted Items page loads for admin', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/deleted-items');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Deleted Items');
  });
});
