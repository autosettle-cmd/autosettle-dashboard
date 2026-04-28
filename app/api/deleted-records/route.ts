/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaUnfiltered } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = session.user.role;
    if (role !== 'accountant' && role !== 'admin' && role !== 'platform_owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build firm scope
    let firmFilter: { in: string[] } | undefined;
    if (role === 'admin') {
      if (!session.user.firm_id) return NextResponse.json({ error: 'No firm' }, { status: 400 });
      firmFilter = { in: [session.user.firm_id] };
    } else if (role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      if (firmIds) firmFilter = { in: firmIds };
      // null = all firms (super admin)
    }
    // platform_owner = no filter (sees all)

    const typeParam = request.nextUrl.searchParams.get('type');
    const deletedWhere = { deleted_at: { not: null } as any, ...(firmFilter ? { firm_id: firmFilter } : {}) };

    const results: any[] = [];

    // Fetch all types or a specific type
    const types = typeParam ? [typeParam] : ['invoice', 'claim', 'payment', 'bankStatement'];

    if (types.includes('invoice')) {
      const invoices = await prismaUnfiltered.invoice.findMany({
        where: deletedWhere,
        select: {
          id: true, firm_id: true, type: true, vendor_name_raw: true, invoice_number: true,
          total_amount: true, deleted_at: true, deleted_by: true,
          firm: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        orderBy: { deleted_at: 'desc' },
        take: 200,
      });
      for (const inv of invoices) {
        const typeLabel = inv.type === 'sales' ? 'Sales Invoice' : 'Invoice';
        const desc = inv.type === 'sales'
          ? `${inv.supplier?.name ?? ''} #${inv.invoice_number}`
          : inv.vendor_name_raw + (inv.invoice_number ? ` #${inv.invoice_number}` : '');
        results.push({
          id: inv.id, type: typeLabel, firmId: inv.firm_id, firmName: inv.firm.name,
          description: desc,
          amount: inv.total_amount.toString(), deletedAt: inv.deleted_at, deletedBy: inv.deleted_by,
        });
      }
    }

    if (types.includes('claim')) {
      const claims = await prismaUnfiltered.claim.findMany({
        where: deletedWhere,
        select: {
          id: true, firm_id: true, merchant: true, amount: true,
          deleted_at: true, deleted_by: true, type: true,
          firm: { select: { name: true } },
        },
        orderBy: { deleted_at: 'desc' },
        take: 200,
      });
      for (const c of claims) {
        const typeLabel = c.type === 'mileage' ? 'Mileage Claim' : c.type === 'receipt' ? 'Receipt' : 'Claim';
        results.push({
          id: c.id, type: typeLabel, firmId: c.firm_id, firmName: c.firm.name,
          description: c.merchant,
          amount: c.amount.toString(), deletedAt: c.deleted_at, deletedBy: c.deleted_by,
        });
      }
    }

    if (types.includes('payment')) {
      const payments = await prismaUnfiltered.payment.findMany({
        where: deletedWhere,
        select: {
          id: true, firm_id: true, amount: true, payment_date: true, reference: true,
          deleted_at: true, deleted_by: true,
          firm: { select: { name: true } },
          supplier: { select: { name: true } },
          employee: { select: { name: true } },
        },
        orderBy: { deleted_at: 'desc' },
        take: 200,
      });
      for (const p of payments) {
        const name = p.supplier?.name || p.employee?.name || 'Payment';
        results.push({
          id: p.id, type: 'Payment', firmId: p.firm_id, firmName: p.firm.name,
          description: `${name}${p.reference ? ` (${p.reference})` : ''}`,
          amount: p.amount.toString(), deletedAt: p.deleted_at, deletedBy: p.deleted_by,
        });
      }
    }

    if (types.includes('bankStatement')) {
      const statements = await prismaUnfiltered.bankStatement.findMany({
        where: deletedWhere,
        select: {
          id: true, firm_id: true, bank_name: true, account_number: true,
          statement_date: true, file_name: true,
          deleted_at: true, deleted_by: true,
          firm: { select: { name: true } },
          _count: { select: { transactions: true } },
        },
        orderBy: { deleted_at: 'desc' },
        take: 200,
      });
      for (const s of statements) {
        results.push({
          id: s.id, type: 'Bank Statement', model: 'bankStatement', firmId: s.firm_id, firmName: s.firm.name,
          description: `${s.bank_name} ${s.account_number ?? ''} — ${s.file_name} (${s._count.transactions} txns)`,
          amount: null, deletedAt: s.deleted_at, deletedBy: s.deleted_by,
        });
      }
    }

    // Sort by deleted_at descending across all types
    results.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    // Resolve deleted_by user names
    const userIds = Array.from(new Set(results.map(r => r.deletedBy).filter(Boolean)));
    const users = userIds.length > 0
      ? await prismaUnfiltered.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    for (const r of results) {
      r.deletedByName = r.deletedBy ? (userMap[r.deletedBy] || 'Unknown') : null;
    }

    return NextResponse.json({ data: results, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
