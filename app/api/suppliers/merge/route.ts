import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/**
 * POST /api/suppliers/merge
 * Merge sourceId supplier into targetId supplier.
 * Moves all invoices, payments, aliases. Deletes source.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !['accountant', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sourceId, targetId } = await request.json();
  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: 'Invalid source/target' }, { status: 400 });
  }

  // Load both suppliers
  const [source, target] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: sourceId }, select: { id: true, name: true, firm_id: true } }),
    prisma.supplier.findUnique({ where: { id: targetId }, select: { id: true, name: true, firm_id: true } }),
  ]);

  if (!source || !target) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  if (source.firm_id !== target.firm_id) return NextResponse.json({ error: 'Suppliers must be in the same firm' }, { status: 400 });

  // Firm access check
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(source.firm_id)) {
      return NextResponse.json({ error: 'Unauthorized for this firm' }, { status: 403 });
    }
  } else if (session.user.role === 'admin' && session.user.firm_id !== source.firm_id) {
    return NextResponse.json({ error: 'Unauthorized for this firm' }, { status: 403 });
  }

  // Move all references from source → target
  const [invoices, payments] = await Promise.all([
    prisma.invoice.updateMany({ where: { supplier_id: sourceId }, data: { supplier_id: targetId } }),
    prisma.payment.updateMany({ where: { supplier_id: sourceId }, data: { supplier_id: targetId } }),
  ]);

  // Move aliases — add source's aliases to target (skip duplicates)
  const sourceAliases = await prisma.supplierAlias.findMany({ where: { supplier_id: sourceId }, select: { alias: true } });
  let aliasesMoved = 0;
  for (const a of sourceAliases) {
    try {
      await prisma.supplierAlias.create({ data: { supplier_id: targetId, alias: a.alias, is_confirmed: true } });
      aliasesMoved++;
    } catch { /* duplicate alias, skip */ }
  }

  // Also add the source supplier's name as an alias on target
  const sourceNameAlias = source.name.toLowerCase().trim();
  try {
    await prisma.supplierAlias.create({ data: { supplier_id: targetId, alias: sourceNameAlias, is_confirmed: true } });
    aliasesMoved++;
  } catch { /* already exists */ }

  // Delete source aliases then source supplier
  await prisma.supplierAlias.deleteMany({ where: { supplier_id: sourceId } });
  await prisma.supplier.delete({ where: { id: sourceId } });

  return NextResponse.json({
    data: {
      merged: {
        invoices: invoices.count,
        payments: payments.count,
        aliases: aliasesMoved,
      },
      target: target.name,
    },
  });
}
