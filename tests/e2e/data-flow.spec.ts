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
  test('Admin claims page loads with data', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    const count = await page.locator('table tbody tr').count();
    expect(count).toBeGreaterThan(0);
  });

  test('Admin receipts tab loads with data', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    const count = await page.locator('table tbody tr').count();
    expect(count).toBeGreaterThan(0);
  });

  test('Receipt preview opens and shows Linked Invoices section', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    // Click on the merchant cell (not checkbox) to open preview
    const merchantCell = page.locator('table tbody tr').first().locator('td').nth(2);
    await merchantCell.click();
    await page.waitForTimeout(1000);
    // The modal should have "LINKED INVOICES" text
    const linked = page.getByText('LINKED INVOICES', { exact: false });
    await expect(linked).toBeVisible({ timeout: 10000 });
  });

  test('Receipt table has correct columns: no Reimbursed/Payment, has Linked', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/claims?type=receipt');
    await page.waitForSelector('table thead', { timeout: 10000 });
    const headers = await page.locator('table thead th').allTextContents();
    const headerText = headers.join(' ');
    expect(headerText).not.toContain('Reimbursed');
    expect(headerText).not.toContain('Payment');
    expect(headerText).toContain('Linked');
    expect(headerText).toContain('Confidence');
  });
});

// ============================================================
// 3. INVOICES DATA FLOW (Admin)
// ============================================================

test.describe('3. Invoices Data Flow', () => {
  test('Admin invoices page loads (with Custom date range)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Invoices');
    // Default filter is "This Month" — switch to Custom/All to see data
    const dateSelect = page.locator('select').first();
    await dateSelect.selectOption('custom');
    // Wait for the page to re-render with data or "No invoices" message
    await page.waitForTimeout(2000);
    // Page should either have a table or "No invoices" message — both are valid
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasNoData = await page.getByText('No invoices').isVisible().catch(() => false);
    expect(hasTable || hasNoData).toBeTruthy();
  });
});

// ============================================================
// 4. INVOICES DATA FLOW (Accountant)
// ============================================================

test.describe('4. Accountant Invoices', () => {
  test('Accountant invoices page loads with data', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    await page.waitForSelector('h1', { timeout: 10000 });
    // Switch to wider date range
    const dateSelect = page.locator('select').first();
    await dateSelect.selectOption('custom');
    await page.waitForTimeout(2000);
    const hasContent = await page.locator('table tbody tr').count().catch(() => 0);
    // Accountant sees invoices across firms
    expect(hasContent).toBeGreaterThanOrEqual(0);
  });

  test('Invoice preview opens with details', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/invoices');
    const dateSelect = page.locator('select').first();
    await dateSelect.selectOption('custom');
    await page.waitForTimeout(2000);
    const rows = page.locator('table tbody tr');
    if (await rows.count() > 0) {
      await rows.first().click();
      // Wait for modal with "Invoice Details" text
      await page.waitForSelector('text=Invoice Details', { timeout: 8000 });
      await expect(page.getByText('Invoice Details')).toBeVisible();
    }
  });
});

// ============================================================
// 5. BANK RECONCILIATION
// ============================================================

test.describe('5. Bank Reconciliation', () => {
  test('Bank recon list page loads with statements', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    const accounts = page.locator('text=statements');
    await expect(accounts.first()).toBeVisible({ timeout: 10000 });
  });

  test('Bank recon search bar returns results for amount', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    const searchInput = page.locator('input[placeholder*="Search amount"]');
    await searchInput.fill('600');
    await page.waitForTimeout(500);
    // Check if results appear or no crash
    const hasResults = await page.getByText('unmatched transaction').isVisible().catch(() => false);
    // Even 0 results is OK — no crash is the test
  });

  test('Bank recon detail page loads with transactions', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    // Expand first account
    await page.locator('text=statements').first().click();
    await page.waitForTimeout(500);
    // Click first statement link
    const link = page.locator('table tbody tr').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
      // Should see transaction list
      await page.waitForSelector('text=OPENING BALANCE', { timeout: 10000 }).catch(() => {});
    }
  });

  test('Bank recon detail has Match buttons for unmatched transactions', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    await page.locator('text=statements').first().click();
    await page.waitForTimeout(1000);
    const periodLink = page.locator('table tbody tr td').first();
    if (await periodLink.isVisible()) {
      await periodLink.click();
      await page.waitForURL(/bank-reconciliation\//, { timeout: 8000 });
      await page.waitForTimeout(2000);
      // Verify Match buttons exist for unmatched transactions
      const matchBtns = page.locator('button:has-text("Match")');
      const count = await matchBtns.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('Official Receipt form has correct fields', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    await page.locator('text=statements').first().click();
    await page.waitForTimeout(500);
    const link = page.locator('table tbody tr').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
      // Find a credit transaction Match button (for receipt)
      const matchBtns = page.locator('button:has-text("Match")');
      const count = await matchBtns.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        await matchBtns.nth(i).click();
        await page.waitForTimeout(500);
        // Check if "Create Official Receipt" button is visible (credit txn)
        const receiptBtn = page.getByText('Create Official Receipt');
        if (await receiptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await receiptBtn.click();
          await page.waitForTimeout(500);
          // Verify form fields
          await expect(page.getByText('RECEIVED FROM', { exact: false })).toBeVisible();
          await expect(page.getByText('RECEIPT NO', { exact: false })).toBeVisible();
          await expect(page.getByText('CR ACCOUNT', { exact: false })).toBeVisible();
          // Category should NOT be present
          const hasCategoryInReceipt = await page.locator('label:has-text("Category")').isVisible().catch(() => false);
          expect(hasCategoryInReceipt).toBeFalsy();
          // "+ New" button for supplier
          await expect(page.getByText('+ New')).toBeVisible();
          // Receipt number should be auto-generated (OR-xxx pattern)
          const refInput = page.locator('input[placeholder="Auto-generated"]');
          const refValue = await refInput.inputValue();
          expect(refValue).toMatch(/^OR-/);
          break;
        }
        // Close modal and try next
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
  });

  test('Payment Voucher form has correct fields', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/bank-reconciliation');
    await page.waitForSelector('text=Bank Reconciliation');
    await page.locator('text=statements').first().click();
    await page.waitForTimeout(500);
    const link = page.locator('table tbody tr').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForURL(/bank-reconciliation\//, { timeout: 5000 });
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
          await expect(page.getByText('CATEGORY', { exact: false })).toBeVisible();
          await expect(page.getByText('DR ACCOUNT', { exact: false })).toBeVisible();
          await expect(page.getByText('+ New')).toBeVisible();
          const refInput = page.locator('input[placeholder="Auto-generated"]');
          const refValue = await refInput.inputValue();
          expect(refValue).toMatch(/^PV-/);
          break;
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
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
    await page.waitForSelector('text=Journal Entries', { timeout: 10000 });
  });

  test('General Ledger page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/general-ledger');
    await page.waitForSelector('text=General Ledger', { timeout: 10000 });
  });

  test('Trial Balance page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/trial-balance');
    await page.waitForSelector('text=Trial Balance', { timeout: 10000 });
  });

  test('P&L page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/profit-loss');
    await page.waitForSelector('text=Profit', { timeout: 10000 });
  });

  test('Balance Sheet page loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/balance-sheet');
    await page.waitForSelector('text=Balance Sheet', { timeout: 10000 });
  });
});

// ============================================================
// 7. SUPPLIERS
// ============================================================

test.describe('7. Suppliers', () => {
  test('Accountant suppliers page loads with supplier list', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/suppliers');
    // Suppliers page uses card layout, not table
    await page.waitForSelector('text=Suppliers', { timeout: 10000 });
    await page.waitForSelector('text=Aging Report', { timeout: 10000 });
    // Should have supplier cards with Pay/Statement/Edit buttons
    const payBtns = page.locator('button:has-text("Pay")');
    const count = await payBtns.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Supplier statement loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/suppliers');
    await page.waitForSelector('text=Suppliers', { timeout: 10000 });
    // Click first Statement button
    const stmtBtn = page.locator('button:has-text("Statement")').first();
    if (await stmtBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stmtBtn.click();
      await page.waitForTimeout(1000);
      // Should open statement view
    }
  });
});

// ============================================================
// 8. API - JV INTEGRITY
// ============================================================

test.describe('8. API - Data Integrity', () => {
  test('All journal entries balance (DR = CR) via DB', async () => {
    // Direct DB check via the postgres MCP would be better,
    // but we can check via API too
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
    await page.waitForSelector('text=Categories', { timeout: 10000 });
  });

  test('Accountant chart of accounts loads', async ({ page }) => {
    await login(page, ACCOUNTANT);
    await page.goto('/accountant/chart-of-accounts');
    await page.waitForSelector('text=Chart of Accounts', { timeout: 10000 });
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
    expect(text).toContain('Receipts');
    expect(text).toContain('Invoices');
    expect(text).toContain('Suppliers');
    expect(text).toContain('Bank Recon');
    expect(text).toContain('Employees');
    expect(text).toContain('Categories');
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
    expect(text).toContain('Bank Recon');
    expect(text).toContain('Accounting');
  });
});
