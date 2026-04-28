import { NextRequest, NextResponse } from 'next/server';
import { prismaUnfiltered } from '@/lib/prisma';
import { deleteFileFromDrive } from '@/lib/google-drive';

export const dynamic = 'force-dynamic';

const GRACE_PERIOD_DAYS = 30;

/**
 * Cron: permanently delete soft-deleted records past the 30-day grace period.
 * Runs weekly (Sunday 3 AM UTC). Cleans up Drive files before hard-deleting.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - GRACE_PERIOD_DAYS);

    const summary: Record<string, number> = {};

    // Order matters: Payments first (references claims/invoices), then claims, invoices, sales invoices

    // 1. Payments
    const payments = await prismaUnfiltered.payment.findMany({
      where: { deleted_at: { lt: cutoff, not: null } },
      select: { id: true },
    });
    if (payments.length > 0) {
      await prismaUnfiltered.payment.deleteMany({
        where: { id: { in: payments.map(p => p.id) } },
      });
    }
    summary.payments = payments.length;

    // 2. Claims
    const claims = await prismaUnfiltered.claim.findMany({
      where: { deleted_at: { lt: cutoff, not: null } },
      select: { id: true, file_url: true },
    });
    for (const claim of claims) {
      deleteFileFromDrive(claim.file_url).catch(() => {});
    }
    if (claims.length > 0) {
      await prismaUnfiltered.claim.deleteMany({
        where: { id: { in: claims.map(c => c.id) } },
      });
    }
    summary.claims = claims.length;

    // 3. Invoices
    const invoices = await prismaUnfiltered.invoice.findMany({
      where: { deleted_at: { lt: cutoff, not: null } },
      select: { id: true, file_url: true },
    });
    for (const inv of invoices) {
      deleteFileFromDrive(inv.file_url).catch(() => {});
    }
    if (invoices.length > 0) {
      // Delete child lines first (InvoiceLine has cascade but being explicit)
      await prismaUnfiltered.invoiceLine.deleteMany({
        where: { invoice_id: { in: invoices.map(i => i.id) } },
      });
      await prismaUnfiltered.invoice.deleteMany({
        where: { id: { in: invoices.map(i => i.id) } },
      });
    }
    summary.invoices = invoices.length;

    // 4. Sales Invoices
    const salesInvoices = await prismaUnfiltered.salesInvoice.findMany({
      where: { deleted_at: { lt: cutoff, not: null } },
      select: { id: true, file_url: true },
    });
    for (const si of salesInvoices) {
      deleteFileFromDrive(si.file_url).catch(() => {});
    }
    if (salesInvoices.length > 0) {
      await prismaUnfiltered.salesInvoiceItem.deleteMany({
        where: { sales_invoice_id: { in: salesInvoices.map(s => s.id) } },
      });
      await prismaUnfiltered.salesInvoice.deleteMany({
        where: { id: { in: salesInvoices.map(s => s.id) } },
      });
    }
    summary.salesInvoices = salesInvoices.length;

    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    console.log(`[hard-delete-expired] Purged ${total} records:`, summary);

    return NextResponse.json({ ok: true, purged: summary, cutoff: cutoff.toISOString() });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
