import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Cron endpoint to keep serverless functions warm and DB connection pool alive */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent abuse
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Simple DB ping to keep connection pool warm
  const result = await prisma.$queryRawUnsafe('SELECT 1 as ping');
  return NextResponse.json({ ok: true, ping: result, ts: new Date().toISOString() });
}
