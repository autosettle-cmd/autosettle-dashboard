import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id: supplierId } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, contact_email: true, contact_phone: true, firm_id: true },
  });
  if (!supplier || (firmIds && !firmIds.includes(supplier.firm_id))) {
    return NextResponse.json({ data: null, error: 'Supplier not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const from = dateFrom ? new Date(dateFrom) : new Date(0);
  const to = dateTo ? new Date(dateTo) : new Date();
  to.setHours(23, 59, 59, 999);

  // ── Get supplier's invoice IDs and sales invoice IDs for bank recon lookup ──
  const [supplierInvoiceIds, supplierSalesInvoiceIds] = await Promise.all([
    prisma.invoice.findMany({
      where: { supplier_id: supplierId },
      select: { id: true },
    }),
    prisma.salesInvoice.findMany({
      where: { supplier_id: supplierId },
      select: { id: true },
    }),
  ]);
  const invIds = supplierInvoiceIds.map(i => i.id);
  const sInvIds = supplierSalesInvoiceIds.map(i => i.id);

  // ── Opening balance: invoices + bank recon payments + legacy payments ──
  const [invoicesBefore, salesInvoicesBefore, outPaymentsBefore, inPaymentsBefore, bankReconOutBefore, bankReconInBefore] = await Promise.all([
    prisma.invoice.aggregate({
      where: { supplier_id: supplierId, issue_date: { lt: from } },
      _sum: { total_amount: true },
    }),
    prisma.salesInvoice.aggregate({
      where: { supplier_id: supplierId, issue_date: { lt: from } },
      _sum: { total_amount: true },
    }),
    prisma.payment.aggregate({
      where: { supplier_id: supplierId, direction: 'outgoing', payment_date: { lt: from } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { supplier_id: supplierId, direction: 'incoming', payment_date: { lt: from } },
      _sum: { amount: true },
    }),
    // Bank recon: outgoing payments (matched to supplier invoices, confirmed)
    invIds.length > 0
      ? prisma.bankTransaction.aggregate({
          where: {
            matched_invoice_id: { in: invIds },
            recon_status: 'manually_matched',
            transaction_date: { lt: from },
          },
          _sum: { debit: true },
        })
      : { _sum: { debit: null } },
    // Bank recon: incoming payments (matched to sales invoices, confirmed)
    sInvIds.length > 0
      ? prisma.bankTransaction.aggregate({
          where: {
            matched_sales_invoice_id: { in: sInvIds },
            recon_status: 'manually_matched',
            transaction_date: { lt: from },
          },
          _sum: { credit: true },
        })
      : { _sum: { credit: null } },
  ]);

  const openingBalance =
    Number(invoicesBefore._sum.total_amount ?? 0)
    - Number(outPaymentsBefore._sum.amount ?? 0)
    - Number(bankReconOutBefore._sum.debit ?? 0)
    - Number(salesInvoicesBefore._sum.total_amount ?? 0)
    + Number(inPaymentsBefore._sum.amount ?? 0)
    + Number(bankReconInBefore._sum.credit ?? 0);

  // ── Entries in period ──
  const [invoices, outPayments, salesInvoices, inPayments, bankReconOut, bankReconIn] = await Promise.all([
    prisma.invoice.findMany({
      where: { supplier_id: supplierId, issue_date: { gte: from, lte: to } },
      select: { id: true, invoice_number: true, issue_date: true, total_amount: true, vendor_name_raw: true },
      orderBy: { issue_date: 'asc' },
    }),
    prisma.payment.findMany({
      where: { supplier_id: supplierId, direction: 'outgoing', payment_date: { gte: from, lte: to } },
      select: { id: true, reference: true, payment_date: true, amount: true, notes: true },
      orderBy: { payment_date: 'asc' },
    }),
    prisma.salesInvoice.findMany({
      where: { supplier_id: supplierId, issue_date: { gte: from, lte: to } },
      select: { id: true, invoice_number: true, issue_date: true, total_amount: true },
      orderBy: { issue_date: 'asc' },
    }),
    prisma.payment.findMany({
      where: { supplier_id: supplierId, direction: 'incoming', payment_date: { gte: from, lte: to } },
      select: { id: true, reference: true, payment_date: true, amount: true, notes: true },
      orderBy: { payment_date: 'asc' },
    }),
    // Bank recon matched payments for supplier invoices
    invIds.length > 0
      ? prisma.bankTransaction.findMany({
          where: {
            matched_invoice_id: { in: invIds },
            recon_status: 'manually_matched',
            transaction_date: { gte: from, lte: to },
          },
          select: {
            id: true, transaction_date: true, description: true, debit: true,
            matchedInvoice: { select: { invoice_number: true, vendor_name_raw: true } },
            bankStatement: { select: { bank_name: true, account_number: true } },
          },
          orderBy: { transaction_date: 'asc' },
        })
      : [],
    // Bank recon matched receipts for sales invoices
    sInvIds.length > 0
      ? prisma.bankTransaction.findMany({
          where: {
            matched_sales_invoice_id: { in: sInvIds },
            recon_status: 'manually_matched',
            transaction_date: { gte: from, lte: to },
          },
          select: {
            id: true, transaction_date: true, description: true, credit: true,
            matchedSalesInvoice: { select: { invoice_number: true } },
            bankStatement: { select: { bank_name: true, account_number: true } },
          },
          orderBy: { transaction_date: 'asc' },
        })
      : [],
  ]);

  // Batch-fetch receipt names for legacy payments (avoids N+1)
  const allPaymentIds = [...outPayments, ...inPayments].map((p) => p.id);
  const receiptMap = new Map<string, string[]>();
  if (allPaymentIds.length > 0) {
    const paymentReceipts = await prisma.paymentReceipt.findMany({
      where: { payment_id: { in: allPaymentIds } },
      select: { payment_id: true, claim: { select: { merchant: true, receipt_number: true } } },
    });
    for (const pr of paymentReceipts) {
      const names = receiptMap.get(pr.payment_id) ?? [];
      names.push(pr.claim.receipt_number || pr.claim.merchant);
      receiptMap.set(pr.payment_id, names);
    }
  }

  type Entry = { date: string; type: string; reference: string; description: string; debit: number; credit: number; balance: number };
  const entries: Entry[] = [];

  for (const inv of invoices) {
    entries.push({
      date: inv.issue_date.toISOString(),
      type: 'purchase_invoice',
      reference: inv.invoice_number ?? '-',
      description: `Purchase — ${inv.vendor_name_raw}`,
      debit: 0,
      credit: Number(inv.total_amount),
      balance: 0,
    });
  }

  // Legacy outgoing payments
  for (const pmt of outPayments) {
    const receiptNames = receiptMap.get(pmt.id) ?? [];
    let description = 'Payment Out';
    if (receiptNames.length > 0) description += ` — ${receiptNames.join(', ')}`;
    else if (pmt.notes) description += ` — ${pmt.notes}`;

    entries.push({
      date: pmt.payment_date.toISOString(),
      type: 'outgoing_payment',
      reference: pmt.reference ?? '-',
      description,
      debit: Number(pmt.amount),
      credit: 0,
      balance: 0,
    });
  }

  // Bank recon outgoing payments (matched to supplier invoices)
  for (const txn of bankReconOut) {
    const invRef = txn.matchedInvoice?.invoice_number ?? '-';
    entries.push({
      date: txn.transaction_date.toISOString(),
      type: 'bank_recon_payment',
      reference: invRef,
      description: `Payment — ${txn.matchedInvoice?.vendor_name_raw ?? txn.description} (${txn.bankStatement.bank_name})`,
      debit: Number(txn.debit ?? 0),
      credit: 0,
      balance: 0,
    });
  }

  for (const sinv of salesInvoices) {
    entries.push({
      date: sinv.issue_date.toISOString(),
      type: 'sales_invoice',
      reference: sinv.invoice_number,
      description: `Sales Invoice — ${sinv.invoice_number}`,
      debit: Number(sinv.total_amount),
      credit: 0,
      balance: 0,
    });
  }

  // Legacy incoming payments
  for (const pmt of inPayments) {
    const receiptNames = receiptMap.get(pmt.id) ?? [];
    let description = 'Payment In';
    if (receiptNames.length > 0) description += ` — ${receiptNames.join(', ')}`;
    else if (pmt.notes) description += ` — ${pmt.notes}`;

    entries.push({
      date: pmt.payment_date.toISOString(),
      type: 'incoming_payment',
      reference: pmt.reference ?? '-',
      description,
      debit: 0,
      credit: Number(pmt.amount),
      balance: 0,
    });
  }

  // Bank recon incoming receipts (matched to sales invoices)
  for (const txn of bankReconIn) {
    const invRef = txn.matchedSalesInvoice?.invoice_number ?? '-';
    entries.push({
      date: txn.transaction_date.toISOString(),
      type: 'bank_recon_receipt',
      reference: invRef,
      description: `Receipt — ${invRef} (${txn.bankStatement.bank_name})`,
      debit: 0,
      credit: Number(txn.credit ?? 0),
      balance: 0,
    });
  }

  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (diff !== 0) return diff;
    if (a.debit > 0 && b.credit > 0) return -1;
    if (a.credit > 0 && b.debit > 0) return 1;
    return 0;
  });

  let balance = openingBalance;
  for (const entry of entries) {
    balance += entry.credit - entry.debit;
    entry.balance = balance;
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return NextResponse.json({
    data: {
      supplier: { id: supplier.id, name: supplier.name, contact_email: supplier.contact_email, contact_phone: supplier.contact_phone },
      period: { from: from.toISOString(), to: to.toISOString() },
      opening_balance: openingBalance,
      entries,
      totals: { total_debit: totalDebit, total_credit: totalCredit },
      closing_balance: balance,
    },
    error: null,
  });
}
