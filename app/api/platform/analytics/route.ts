import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'platform_owner') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    firmCount,
    activeFirmCount,
    usersByRole,
    activeUserCount,
    recentFirms,
    claimCount,
    invoiceCount,
    journalEntryCount,
    claimsThisMonth,
    invoicesThisMonth,
    journalEntriesThisMonth,
    firmStats,
  ] = await Promise.all([
    prisma.firm.count(),
    prisma.firm.count({ where: { is_active: true } }),
    prisma.user.groupBy({ by: ['role'], _count: true, where: { is_active: true } }),
    prisma.user.count({ where: { is_active: true } }),
    prisma.firm.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, name: true, created_at: true, is_active: true },
    }),
    prisma.claim.count(),
    prisma.invoice.count(),
    prisma.journalEntry.count(),
    prisma.claim.count({ where: { created_at: { gte: startOfMonth } } }),
    prisma.invoice.count({ where: { created_at: { gte: startOfMonth } } }),
    prisma.journalEntry.count({ where: { created_at: { gte: startOfMonth } } }),
    prisma.firm.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            users: true,
            claims: true,
            invoices: true,
            journalEntries: true,
            employees: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const roleMap: Record<string, number> = {};
  for (const r of usersByRole) {
    roleMap[r.role] = r._count;
  }

  return NextResponse.json({
    data: {
      firms: {
        total: firmCount,
        active: activeFirmCount,
        inactive: firmCount - activeFirmCount,
        recent: recentFirms,
      },
      users: {
        total: activeUserCount,
        accountants: roleMap['accountant'] ?? 0,
        admins: roleMap['admin'] ?? 0,
        employees: roleMap['employee'] ?? 0,
        platform_owners: roleMap['platform_owner'] ?? 0,
      },
      activity: {
        claims: { total: claimCount, thisMonth: claimsThisMonth },
        invoices: { total: invoiceCount, thisMonth: invoicesThisMonth },
        journalEntries: { total: journalEntryCount, thisMonth: journalEntriesThisMonth },
      },
      firmStats: firmStats.map(f => ({
        id: f.id,
        name: f.name,
        users: f._count.users,
        employees: f._count.employees,
        claims: f._count.claims,
        invoices: f._count.invoices,
        journalEntries: f._count.journalEntries,
      })),
    },
    error: null,
  });
}
