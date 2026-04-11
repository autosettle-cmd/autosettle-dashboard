import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

interface SupplierBucket {
  supplier_id: string;
  supplier_name: string;
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
  invoices: {
    id: string;
    invoice_number: string | null;
    issue_date: string;
    due_date: string | null;
    total_amount: string;
    amount_paid: string;
    balance: string;
    payment_status: string;
    category_name: string;
    vendor_name_raw: string;
    bucket: string;
  }[];
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);
  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');

  const now = new Date();

  const invoices = await prisma.invoice.findMany({
    where: {
      ...firmScope(firmIds, firmId),
      payment_status: { not: 'paid' },
    },
    select: {
      id: true,
      supplier_id: true,
      vendor_name_raw: true,
      invoice_number: true,
      issue_date: true,
      due_date: true,
      total_amount: true,
      amount_paid: true,
      payment_status: true,
      supplier: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: { issue_date: 'asc' },
  });

  const supplierMap = new Map<string, SupplierBucket>();

  for (const inv of invoices) {
    const supplierId = inv.supplier_id ?? 'unlinked';
    const supplierName = inv.supplier?.name ?? inv.vendor_name_raw;
    const balance = Number(inv.total_amount) - Number(inv.amount_paid);

    if (!supplierMap.has(supplierId)) {
      supplierMap.set(supplierId, {
        supplier_id: supplierId,
        supplier_name: supplierName,
        days0_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90plus: 0,
        total: 0,
        invoices: [],
      });
    }

    const entry = supplierMap.get(supplierId)!;

    // Calculate aging bucket from issue date (LHDN ruling)
    const diffDays = Math.floor((now.getTime() - inv.issue_date.getTime()) / (1000 * 60 * 60 * 24));
    let bucket: string;
    if (diffDays <= 30) bucket = '0-30';
    else if (diffDays <= 60) bucket = '31-60';
    else if (diffDays <= 90) bucket = '61-90';
    else bucket = '90+';

    switch (bucket) {
      case '0-30':   entry.days0_30 += balance; break;
      case '31-60':  entry.days31_60 += balance; break;
      case '61-90':  entry.days61_90 += balance; break;
      case '90+':    entry.days90plus += balance; break;
    }
    entry.total += balance;

    entry.invoices.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date.toISOString(),
      due_date: inv.due_date?.toISOString() ?? null,
      total_amount: inv.total_amount.toString(),
      amount_paid: inv.amount_paid.toString(),
      balance: balance.toFixed(2),
      payment_status: inv.payment_status,
      category_name: inv.category.name,
      vendor_name_raw: inv.vendor_name_raw,
      bucket,
    });
  }

  const data = Array.from(supplierMap.values()).sort((a, b) => b.total - a.total);

  const summary = {
    days0_30: data.reduce((s, r) => s + r.days0_30, 0),
    days31_60: data.reduce((s, r) => s + r.days31_60, 0),
    days61_90: data.reduce((s, r) => s + r.days61_90, 0),
    days90plus: data.reduce((s, r) => s + r.days90plus, 0),
    total: data.reduce((s, r) => s + r.total, 0),
  };

  return NextResponse.json({ data: { suppliers: data, summary }, error: null });
}
