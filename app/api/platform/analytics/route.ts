import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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

    // ── Chart data ──────────────────────────────────────────────────────────────

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      uploadVolume,
      claimConfidence,
      invoiceConfidence,
      claimsPipeline,
      invoicesPipeline,
      reconHealth,
      ocrStats,
    ] = await Promise.all([
      // Upload volume — last 30 days grouped by day
      prisma.$queryRaw<{ date: string; claims: bigint; invoices: bigint; statements: bigint }[]>`
        SELECT d.date,
          COALESCE(c.cnt, 0) AS claims,
          COALESCE(i.cnt, 0) AS invoices,
          COALESCE(s.cnt, 0) AS statements
        FROM generate_series(
          ${thirtyDaysAgo}::date, CURRENT_DATE, '1 day'
        ) AS d(date)
        LEFT JOIN (SELECT DATE(created_at) AS dt, COUNT(*)::bigint AS cnt FROM "Claim" WHERE created_at >= ${thirtyDaysAgo} GROUP BY dt) c ON c.dt = d.date
        LEFT JOIN (SELECT DATE(created_at) AS dt, COUNT(*)::bigint AS cnt FROM "Invoice" WHERE created_at >= ${thirtyDaysAgo} GROUP BY dt) i ON i.dt = d.date
        LEFT JOIN (SELECT DATE(created_at) AS dt, COUNT(*)::bigint AS cnt FROM "BankStatement" WHERE created_at >= ${thirtyDaysAgo} GROUP BY dt) s ON s.dt = d.date
        ORDER BY d.date
      `,

      // OCR confidence — claims
      prisma.claim.groupBy({ by: ['confidence'], _count: true }),

      // OCR confidence — invoices
      prisma.invoice.groupBy({ by: ['confidence'], _count: true }),

      // Workflow pipeline — claims
      prisma.claim.groupBy({
        by: ['status', 'approval', 'payment_status'],
        _count: true,
      }),

      // Workflow pipeline — invoices
      prisma.invoice.groupBy({
        by: ['status', 'approval', 'payment_status'],
        _count: true,
      }),

      // Bank recon health
      prisma.bankTransaction.groupBy({ by: ['recon_status'], _count: true }),

      // OCR log stats (if any logs exist)
      prisma.ocrLog.aggregate({
        _count: true,
        _avg: { processing_ms: true },
      }).then(async (agg) => {
        const successCount = await prisma.ocrLog.count({ where: { success: true } });
        const failCount = await prisma.ocrLog.count({ where: { success: false } });
        return {
          total: agg._count,
          avgProcessingMs: Math.round(agg._avg.processing_ms ?? 0),
          success: successCount,
          failed: failCount,
        };
      }),
    ]);

    // Transform upload volume (bigint → number)
    const uploadVolumeData = uploadVolume.map((r) => ({
      date: typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0],
      claims: Number(r.claims),
      invoices: Number(r.invoices),
      statements: Number(r.statements),
    }));

    // Transform confidence
    const confidenceData = {
      claims: { HIGH: 0, MEDIUM: 0, LOW: 0, ...Object.fromEntries(claimConfidence.filter(c => c.confidence).map(c => [c.confidence, c._count])) },
      invoices: { HIGH: 0, MEDIUM: 0, LOW: 0, ...Object.fromEntries(invoiceConfidence.filter(c => c.confidence).map(c => [c.confidence, c._count])) },
    };

    // Transform pipeline
    const buildPipeline = (groups: { status: string; approval: string; payment_status: string; _count: number }[]) => {
      let pendingReview = 0, reviewed = 0, approved = 0, paid = 0;
      for (const g of groups) {
        if (g.status === 'pending_review') pendingReview += g._count;
        else if (g.approval === 'pending_approval') reviewed += g._count;
        else if (g.payment_status === 'unpaid' || g.payment_status === 'partially_paid') approved += g._count;
        else paid += g._count;
      }
      return { pendingReview, reviewed, approved, paid };
    };

    // Transform recon health
    const reconMap: Record<string, number> = {};
    for (const r of reconHealth) reconMap[r.recon_status] = r._count;

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
        // Chart data
        charts: {
          uploadVolume: uploadVolumeData,
          confidence: confidenceData,
          pipeline: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            claims: buildPipeline(claimsPipeline as any),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            invoices: buildPipeline(invoicesPipeline as any),
          },
          recon: {
            matched: (reconMap['matched'] ?? 0) + (reconMap['manually_matched'] ?? 0),
            unmatched: reconMap['unmatched'] ?? 0,
            excluded: reconMap['excluded'] ?? 0,
            total: Object.values(reconMap).reduce((s, v) => s + v, 0),
          },
          ocr: ocrStats,
        },
      },
      error: null,
    });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
