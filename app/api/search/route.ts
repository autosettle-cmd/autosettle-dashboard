import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { query, firmId } = await request.json();
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json({ data: { claims: [], invoices: [], transactions: [], suppliers: [], employees: [] } });
    }

    const q = query.trim();
    const role = session.user.role;
    const isNum = /^\d+(\.\d+)?$/.test(q.replace(/,/g, ''));
    const numVal = isNum ? parseFloat(q.replace(/,/g, '')) : null;

    // Build firm scope
    let scope: { firm_id?: string | { in: string[] } } = {};
    if (role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      scope = firmScope(firmIds, firmId);
    } else if (role === 'admin') {
      scope = { firm_id: session.user.firm_id! };
    }

    const textFilter = { contains: q, mode: 'insensitive' as const };
    const LIMIT = 6;

    // Employee role: only own claims
    if (role === 'employee') {
      const empRecord = await prisma.employee.findFirst({ where: { users: { some: { id: session.user.id } } }, select: { id: true } });
      const claims = empRecord ? await prisma.claim.findMany({
        where: {
          employee_id: empRecord.id,
          OR: [
            { merchant: textFilter },
            { description: textFilter },
            { receipt_number: textFilter },
            ...(numVal !== null ? [{ amount: numVal }] : []),
          ],
        },
        select: { id: true, claim_date: true, merchant: true, amount: true, status: true, approval: true, payment_status: true, type: true, category: { select: { name: true } } },
        orderBy: { claim_date: 'desc' },
        take: LIMIT,
      }) : [];

      return NextResponse.json({ data: { claims, invoices: [], transactions: [], suppliers: [], employees: [] } });
    }

    // Accountant / Admin: search all entities in parallel
    const [claims, invoices, transactions, suppliers, employees] = await Promise.all([
      // Claims
      prisma.claim.findMany({
        where: {
          ...scope,
          OR: [
            { merchant: textFilter },
            { description: textFilter },
            { receipt_number: textFilter },
            { employee: { name: textFilter } },
            ...(numVal !== null ? [{ amount: numVal }] : []),
          ],
        },
        select: {
          id: true, claim_date: true, merchant: true, amount: true, status: true,
          approval: true, payment_status: true, type: true, firm_id: true,
          employee: { select: { name: true } },
          category: { select: { name: true } },
          firm: { select: { name: true } },
        },
        orderBy: { claim_date: 'desc' },
        take: LIMIT,
      }),

      // Invoices
      prisma.invoice.findMany({
        where: {
          ...scope,
          OR: [
            { vendor_name_raw: textFilter },
            { invoice_number: textFilter },
            ...(numVal !== null ? [{ total_amount: numVal }] : []),
          ],
        },
        select: {
          id: true, issue_date: true, vendor_name_raw: true, invoice_number: true,
          total_amount: true, status: true, approval: true, payment_status: true, firm_id: true,
          firm: { select: { name: true } },
        },
        orderBy: { issue_date: 'desc' },
        take: LIMIT,
      }),

      // Bank Transactions
      prisma.bankTransaction.findMany({
        where: {
          bankStatement: scope,
          OR: [
            { description: textFilter },
            { reference: textFilter },
            ...(numVal !== null ? [{ debit: numVal }, { credit: numVal }] : []),
          ],
        },
        select: {
          id: true, transaction_date: true, description: true, reference: true,
          debit: true, credit: true, recon_status: true,
          bank_statement_id: true,
          bankStatement: { select: { bank_name: true, account_number: true, firm: { select: { name: true } } } },
        },
        orderBy: { transaction_date: 'desc' },
        take: LIMIT,
      }),

      // Suppliers
      prisma.supplier.findMany({
        where: {
          ...scope,
          is_active: true,
          OR: [
            { name: textFilter },
            { contact_email: textFilter },
          ],
        },
        select: {
          id: true, name: true, firm_id: true,
          firm: { select: { name: true } },
          _count: { select: { invoices: true } },
        },
        orderBy: { name: 'asc' },
        take: LIMIT,
      }),

      // Employees
      prisma.employee.findMany({
        where: {
          ...scope,
          is_active: true,
          OR: [
            { name: textFilter },
            { phone: textFilter },
            { email: textFilter },
          ],
        },
        select: {
          id: true, name: true, phone: true, email: true, firm_id: true,
          firm: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: LIMIT,
      }),
    ]);

    return NextResponse.json({ data: { claims, invoices, transactions, suppliers, employees } });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
