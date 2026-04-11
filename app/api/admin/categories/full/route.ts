import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/categories/full
 * Returns all categories available to the admin's firm with full details,
 * including global defaults with override status.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  // Get global defaults with overrides for this firm
  const globals = await prisma.category.findMany({
    where: { firm_id: null, is_active: true },
    include: {
      overrides: { where: { firm_id: firmId } },
      _count: { select: { claims: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Get firm-specific categories (active and inactive for management)
  const firmCats = await prisma.category.findMany({
    where: { firm_id: firmId },
    include: { _count: { select: { claims: true } } },
    orderBy: { name: 'asc' },
  });

  const data = [
    ...globals.map((g) => ({
      id: g.id,
      name: g.name,
      tax_code: g.tax_code,
      claims_count: g._count.claims,
      is_active: g.overrides.length > 0 ? g.overrides[0].is_active : true,
      is_global: true,
    })),
    ...firmCats.map((c) => ({
      id: c.id,
      name: c.name,
      tax_code: c.tax_code,
      claims_count: c._count.claims,
      is_active: c.is_active,
      is_global: false,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ data, error: null });
}
