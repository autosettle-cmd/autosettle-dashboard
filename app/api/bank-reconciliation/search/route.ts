import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const firmId = request.nextUrl.searchParams.get('firmId');
    if (!q || q.length < 2) {
      return NextResponse.json({ data: [], error: null });
    }

    // Firm scoping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let firmScope: any = {};
    if (session.user.role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      if (firmIds) {
        firmScope = firmId ? { firm_id: firmId } : { firm_id: { in: firmIds } };
      } else {
        firmScope = firmId ? { firm_id: firmId } : {};
      }
    } else {
      firmScope = { firm_id: session.user.firm_id };
    }

    // Parse amount if numeric
    const numericQ = parseFloat(q.replace(/[,\s]/g, ''));
    const isAmount = !isNaN(numericQ) && numericQ > 0;

    // Search unmatched bank transactions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      recon_status: 'unmatched',
      bankStatement: firmScope,
    };

    if (isAmount) {
      // Prefix-based amount search: "4158" matches 4158.00–4158.99, "96" matches 96.00–96.99
      // If user typed decimals like "96.82", do exact match (±0.01)
      const hasDecimals = q.includes('.');
      const lo = hasDecimals ? numericQ - 0.01 : numericQ;
      const hi = hasDecimals ? numericQ + 0.01 : numericQ + 0.999;
      where.OR = [
        { debit: { gte: lo, lte: hi } },
        { credit: { gte: lo, lte: hi } },
      ];
    } else {
      // Search by description or reference
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ];
    }

    const transactions = await prisma.bankTransaction.findMany({
      where,
      select: {
        id: true,
        transaction_date: true,
        description: true,
        reference: true,
        debit: true,
        credit: true,
        bank_statement_id: true,
        bankStatement: {
          select: {
            bank_name: true,
            account_number: true,
            statement_date: true,
            firm_id: true,
          },
        },
      },
      orderBy: { transaction_date: 'desc' },
      take: 20,
    });

    // Batch fetch all potentially matching invoices in ONE query (fixes N+1)
    const uniqueFirmIds = [...new Set(transactions.map(txn => txn.bankStatement.firm_id))];
    const txnAmounts = transactions.map(txn => Number(txn.debit || txn.credit || 0));
    const minAmount = Math.min(...txnAmounts) - 0.01;

    const allInvoices = uniqueFirmIds.length > 0 && transactions.length > 0
      ? await prisma.invoice.findMany({
          where: {
            firm_id: { in: uniqueFirmIds },
            payment_status: { not: 'paid' },
            total_amount: { gte: minAmount },
          },
          select: {
            id: true,
            invoice_number: true,
            vendor_name_raw: true,
            total_amount: true,
            amount_paid: true,
            issue_date: true,
            firm_id: true,
          },
          orderBy: { issue_date: 'desc' },
        })
      : [];

    // Match transactions to invoices in-memory
    const results = transactions.map((txn) => {
      const txnAmount = Number(txn.debit || txn.credit || 0);
      const firmIdForTxn = txn.bankStatement.firm_id;

      // Filter invoices for this transaction's firm and amount range
      const matchingInvoices = allInvoices.filter(inv => {
        if (inv.firm_id !== firmIdForTxn) return false;
        const total = Number(inv.total_amount);
        // Exact amount match on total
        if (total >= txnAmount - 0.01 && total <= txnAmount + 0.01) return true;
        // Balance match (total >= txn amount, so partial payment could match)
        if (txnAmount > 0 && total >= txnAmount) return true;
        return false;
      });

      // Score and filter invoices by balance proximity
      const scoredInvoices = matchingInvoices
        .map(inv => {
          const balance = Number(inv.total_amount) - Number(inv.amount_paid);
          const diff = Math.abs(balance - txnAmount);
          const exactMatch = diff < 0.01;
          return { ...inv, balance, exactMatch, diff };
        })
        .filter(inv => inv.balance > 0.01)
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 3);

      return {
        id: txn.id,
        transaction_date: txn.transaction_date,
        description: txn.description,
        reference: txn.reference,
        amount: txnAmount,
        type: txn.debit ? 'debit' : 'credit',
        bank_name: txn.bankStatement.bank_name,
        account_number: txn.bankStatement.account_number,
        statement_id: txn.bank_statement_id,
        statement_date: txn.bankStatement.statement_date,
        matching_invoices: scoredInvoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          vendor_name: inv.vendor_name_raw,
          total_amount: Number(inv.total_amount),
          balance: inv.balance,
          exact_match: inv.exactMatch,
        })),
      };
    });

    return NextResponse.json({ data: results, error: null });
  } catch (error) {
    console.error('Error searching bank transactions:', error);
    return NextResponse.json({ data: null, error: 'Search failed' }, { status: 500 });
  }
}
