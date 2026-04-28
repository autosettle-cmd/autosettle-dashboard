import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createJournalEntry } from '@/lib/journal-entries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const { bankTransactionId, supplier_id, new_supplier_name, category_id, gl_account_id, reference, notes } = await request.json();
    if (!bankTransactionId) {
      return NextResponse.json({ data: null, error: 'bankTransactionId is required' }, { status: 400 });
    }

    const txn = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      include: { bankStatement: { select: { firm_id: true, bank_name: true, account_number: true } } },
    });
    if (!txn || txn.bankStatement.firm_id !== session.user.firm_id) {
      return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
    }
    if (txn.recon_status !== 'unmatched') {
      return NextResponse.json({ data: null, error: 'Transaction is already matched' }, { status: 400 });
    }
    if (!txn.credit) {
      return NextResponse.json({ data: null, error: 'Official receipt is only for credit (money coming in) transactions' }, { status: 400 });
    }

    const firmId = session.user.firm_id;
    const amount = Number(txn.credit);
    const merchant = txn.description.includes(' | ') ? txn.description.split(' | ')[0].trim() : txn.description.trim();

    // Resolve supplier — create inline if new_supplier_name provided
    let resolvedSupplierId = supplier_id;
    if (!resolvedSupplierId && new_supplier_name?.trim()) {
      const newSupplier = await prisma.supplier.create({
        data: { firm_id: firmId, name: new_supplier_name.trim() },
      });
      resolvedSupplierId = newSupplier.id;
    }
    // Default to "Walk-in Customer" if no supplier specified
    if (!resolvedSupplierId) {
      const walkIn = await prisma.supplier.findFirst({ where: { firm_id: firmId, name: 'Walk-in Customer' } });
      if (walkIn) {
        resolvedSupplierId = walkIn.id;
      } else {
        const newWalkIn = await prisma.supplier.create({ data: { firm_id: firmId, name: 'Walk-in Customer' } });
        resolvedSupplierId = newWalkIn.id;
      }
    }
    const supplier = await prisma.supplier.findUnique({ where: { id: resolvedSupplierId }, select: { firm_id: true, name: true } });
    if (!supplier || supplier.firm_id !== firmId) {
      return NextResponse.json({ data: null, error: 'Supplier not found in this firm' }, { status: 404 });
    }

    // ─── Pre-validate GL accounts — block if JV cannot be created ─────────
    const bankAccount = await prisma.bankAccount.findUnique({
      where: {
        firm_id_bank_name_account_number: {
          firm_id: firmId,
          bank_name: txn.bankStatement.bank_name,
          account_number: txn.bankStatement.account_number ?? '',
        },
      },
      select: { gl_account_id: true },
    });

    let incomeGlId: string | null = gl_account_id || null;
    if (!incomeGlId && category_id) {
      const catOverride = await prisma.categoryFirmOverride.findUnique({
        where: { category_id_firm_id: { category_id, firm_id: firmId } },
        select: { gl_account_id: true },
      });
      incomeGlId = catOverride?.gl_account_id ?? null;
    }
    if (!incomeGlId) {
      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_receivables_gl_id: true } });
      incomeGlId = firm?.default_trade_receivables_gl_id ?? null;
    }

    const missing: string[] = [];
    if (!bankAccount?.gl_account_id) missing.push(`Bank account "${txn.bankStatement.bank_name} ${txn.bankStatement.account_number ?? ''}" has no GL account mapped. Go to Bank Recon → Manage Accounts and assign a GL.`);
    if (!incomeGlId) missing.push('No income GL account found. Assign a GL account, set a category GL mapping, or configure firm default Trade Receivables GL.');
    if (missing.length > 0) {
      return NextResponse.json({ data: null, error: `Cannot create official receipt — JV requires GL accounts:\n${missing.join('\n')}` }, { status: 400 });
    }

    // Generate OR number if no reference provided — OR-{seq} per-firm sequence
    let receiptNumber = reference;
    if (!receiptNumber) {
      const existingOR = await prisma.salesInvoice.findMany({
        where: { firm_id: firmId, invoice_number: { startsWith: 'OR-' } },
        select: { invoice_number: true },
        orderBy: { created_at: 'desc' },
        take: 200,
      });
      let maxNum = 0;
      for (const inv of existingOR) {
        const m = inv.invoice_number.match(/OR-(\d+)/);
        if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
      }
      receiptNumber = `OR-${String(maxNum + 1).padStart(3, '0')}`;
    }

    // Create SalesInvoice record (official receipt = issued invoice, already paid)
    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        firm_id: firmId,
        supplier_id: resolvedSupplierId,
        created_by: session.user.employee_id || null,
        invoice_number: receiptNumber,
        issue_date: txn.transaction_date,
        subtotal: amount,
        tax_amount: 0,
        total_amount: amount,
        amount_paid: amount,
        payment_status: 'paid',
        approval: 'approved',
        notes: notes || `Official receipt — ${merchant}`,
        category_id: category_id || null,
        gl_account_id: gl_account_id || null,
      },
    });

    // Mark bank txn as matched and link to sales invoice
    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        recon_status: 'manually_matched',
        matched_sales_invoice_id: salesInvoice.id,
        matched_at: new Date(),
        matched_by: session.user.id,
        notes: notes || `Official receipt — ${supplier.name}${reference ? ` (${reference})` : ''}`,
      },
    });

    // Create JV — GL accounts already validated above
    await createJournalEntry({
      firmId,
      postingDate: txn.transaction_date,
      description: `Official receipt — ${supplier.name} (${receiptNumber})`,
      sourceType: 'bank_recon',
      sourceId: bankTransactionId,
      voucherPrefix: 'OR',
      lines: [
        { glAccountId: bankAccount!.gl_account_id, debitAmount: amount, creditAmount: 0, description: txn.bankStatement.bank_name },
        { glAccountId: incomeGlId!, debitAmount: 0, creditAmount: amount, description: `${supplier.name} — ${receiptNumber}` },
      ],
      createdBy: session.user.id,
    });

    return NextResponse.json({
      data: { recon_status: 'manually_matched', sales_invoice_id: salesInvoice.id },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
