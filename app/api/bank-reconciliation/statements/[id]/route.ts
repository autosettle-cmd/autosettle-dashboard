import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { id } = await params;

  const statement = await prisma.bankStatement.findUnique({
    where: { id },
    include: {
      transactions: {
        include: {
          matchedPayment: {
            select: {
              id: true, reference: true, payment_date: true, amount: true, direction: true, notes: true,
              supplier: { select: { name: true } },
              employee: { select: { name: true } },
              allocations: { include: { invoice: { select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, issue_date: true } } } },
              receipts: { select: { claim: { select: { id: true, merchant: true, receipt_number: true, amount: true, claim_date: true, thumbnail_url: true, file_url: true, gl_account_id: true, glAccount: { select: { account_code: true, name: true } }, contra_gl_account_id: true, contraGlAccount: { select: { account_code: true, name: true } } } } } },
            },
          },
          matchedInvoice: {
            select: { id: true, invoice_number: true, vendor_name_raw: true, total_amount: true, amount_paid: true, issue_date: true, file_url: true, thumbnail_url: true },
          },
          matchedSalesInvoice: {
            select: { id: true, invoice_number: true, total_amount: true, amount_paid: true, issue_date: true, buyer: { select: { name: true } } },
          },
          matchedClaims: {
            select: { id: true, merchant: true, amount: true, claim_date: true, receipt_number: true, file_url: true, thumbnail_url: true, employee: { select: { id: true, name: true } }, category: { select: { name: true } } },
          },
        },
        orderBy: { transaction_date: 'asc' },
      },
    },
  });

  if (!statement || (firmIds && !firmIds.includes(statement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Statement not found' }, { status: 404 });
  }

  // Fetch bank account GL mapping
  const bankAccountMapping = await prisma.bankAccount.findUnique({
    where: {
      firm_id_bank_name_account_number: {
        firm_id: statement.firm_id,
        bank_name: statement.bank_name,
        account_number: statement.account_number ?? '',
      },
    },
    include: { glAccount: { select: { account_code: true, name: true } } },
  });
  const bankGlLabel = bankAccountMapping?.glAccount
    ? `${bankAccountMapping.glAccount.account_code} — ${bankAccountMapping.glAccount.name}`
    : null;

  let systemDebit = 0, systemCredit = 0;
  for (const txn of statement.transactions) {
    if (txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') {
      if (txn.debit) systemDebit += Number(txn.debit);
      if (txn.credit) systemCredit += Number(txn.credit);
    }
  }

  const matched = statement.transactions.filter((t) => t.recon_status === 'matched' || t.recon_status === 'manually_matched').length;
  const unmatched = statement.transactions.filter((t) => t.recon_status === 'unmatched').length;
  const excluded = statement.transactions.filter((t) => t.recon_status === 'excluded').length;

  // For auto-matched suggestions without PaymentReceipt yet, resolve receipt from Payment notes
  const pendingClaimIds: string[] = [];
  for (const t of statement.transactions) {
    if (t.matchedPayment && t.matchedPayment.receipts.length === 0) {
      const match = t.matchedPayment.notes?.match(/\[claim:([^\]]+)\]/);
      if (match) pendingClaimIds.push(match[1]);
    }
  }
  const pendingClaims = pendingClaimIds.length > 0
    ? await prisma.claim.findMany({
        where: { id: { in: pendingClaimIds } },
        select: { id: true, merchant: true, receipt_number: true, amount: true, claim_date: true, thumbnail_url: true, file_url: true, gl_account_id: true, glAccount: { select: { account_code: true, name: true } }, contra_gl_account_id: true, contraGlAccount: { select: { account_code: true, name: true } } },
      })
    : [];
  const pendingClaimMap = new Map(pendingClaims.map((c) => [c.id, c]));

  return NextResponse.json({
    data: {
      id: statement.id, firm_id: statement.firm_id, bank_name: statement.bank_name, account_number: statement.account_number, bank_gl_label: bankGlLabel,
      statement_date: statement.statement_date, opening_balance: statement.opening_balance?.toString() ?? null,
      closing_balance: statement.closing_balance?.toString() ?? null, file_name: statement.file_name, file_url: statement.file_url,
      created_at: statement.created_at,
      summary: { total: statement.transactions.length, matched, unmatched, excluded },
      system_balance: { debit: systemDebit, credit: systemCredit },
      transactions: statement.transactions.map((t) => {
        // Resolve receipts: from PaymentReceipt (confirmed) or from Payment notes (suggested)
        let receipts = t.matchedPayment?.receipts.map((r) => ({
          id: r.claim.id, merchant: r.claim.merchant, receipt_number: r.claim.receipt_number,
          amount: r.claim.amount.toString(), claim_date: r.claim.claim_date, thumbnail_url: r.claim.thumbnail_url, file_url: r.claim.file_url,
          gl_label: r.claim.glAccount ? `${r.claim.glAccount.account_code} — ${r.claim.glAccount.name}` : null,
          contra_gl_label: r.claim.contraGlAccount ? `${r.claim.contraGlAccount.account_code} — ${r.claim.contraGlAccount.name}` : null,
        })) ?? [];

        // If no PaymentReceipt yet, resolve from Payment notes claim_id
        if (receipts.length === 0 && t.matchedPayment?.notes) {
          const claimMatch = t.matchedPayment.notes.match(/\[claim:([^\]]+)\]/);
          if (claimMatch) {
            const claim = pendingClaimMap.get(claimMatch[1]);
            if (claim) {
              receipts = [{
                id: claim.id, merchant: claim.merchant, receipt_number: claim.receipt_number,
                amount: claim.amount.toString(), claim_date: claim.claim_date, thumbnail_url: claim.thumbnail_url, file_url: claim.file_url,
                gl_label: claim.glAccount ? `${claim.glAccount.account_code} — ${claim.glAccount.name}` : null,
                contra_gl_label: claim.contraGlAccount ? `${claim.contraGlAccount.account_code} — ${claim.contraGlAccount.name}` : null,
              }];
            }
          }
        }

        return {
          id: t.id, transaction_date: t.transaction_date, description: t.description, reference: t.reference,
          cheque_number: t.cheque_number, debit: t.debit?.toString() ?? null, credit: t.credit?.toString() ?? null,
          balance: t.balance?.toString() ?? null, recon_status: t.recon_status, matched_at: t.matched_at, notes: t.notes,
          matched_invoice: t.matchedInvoice ? {
            id: t.matchedInvoice.id, invoice_number: t.matchedInvoice.invoice_number, vendor_name: t.matchedInvoice.vendor_name_raw,
            total_amount: t.matchedInvoice.total_amount.toString(), amount_paid: t.matchedInvoice.amount_paid.toString(),
            issue_date: t.matchedInvoice.issue_date, file_url: t.matchedInvoice.file_url, thumbnail_url: t.matchedInvoice.thumbnail_url,
          } : null,
          matched_sales_invoice: t.matchedSalesInvoice ? {
            id: t.matchedSalesInvoice.id, invoice_number: t.matchedSalesInvoice.invoice_number,
            total_amount: t.matchedSalesInvoice.total_amount.toString(), amount_paid: t.matchedSalesInvoice.amount_paid.toString(),
            issue_date: t.matchedSalesInvoice.issue_date, buyer_name: t.matchedSalesInvoice.buyer?.name ?? 'Unknown',
          } : null,
          matched_claims: t.matchedClaims.length > 0 ? t.matchedClaims.map(c => ({
            id: c.id, merchant: c.merchant, amount: c.amount.toString(),
            claim_date: c.claim_date, receipt_number: c.receipt_number,
            file_url: c.file_url, thumbnail_url: c.thumbnail_url,
            employee_id: c.employee.id, employee_name: c.employee.name, category_name: c.category.name,
          })) : [],
          matched_payment: t.matchedPayment ? {
            id: t.matchedPayment.id, reference: t.matchedPayment.reference, payment_date: t.matchedPayment.payment_date,
            amount: t.matchedPayment.amount.toString(), direction: t.matchedPayment.direction, notes: t.matchedPayment.notes,
            supplier_name: t.matchedPayment.supplier?.name ?? t.matchedPayment.employee?.name ?? 'Unknown',
            allocations: t.matchedPayment.allocations.map((a) => ({
              invoice_id: a.invoice_id, invoice_number: a.invoice.invoice_number, vendor_name: a.invoice.vendor_name_raw,
              total_amount: a.invoice.total_amount.toString(), issue_date: a.invoice.issue_date, allocated_amount: a.amount.toString(),
            })),
            receipts,
          } : null,
        };
      }),
    },
    error: null,
  });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
