import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface SupplierBucket {
  supplier_id: string;
  supplier_name: string;
  current: number;
  days1_30: number;
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const now = new Date();

  // Get all unpaid/partially paid invoices with supplier info
  const invoices = await prisma.invoice.findMany({
    where: {
      firm_id: firmId,
      payment_status: { not: 'paid' },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: { due_date: 'asc' },
  });

  // Group by supplier and calculate aging buckets
  const supplierMap = new Map<string, SupplierBucket>();

  for (const inv of invoices) {
    const supplierId = inv.supplier_id ?? 'unlinked';
    const supplierName = inv.supplier?.name ?? inv.vendor_name_raw;
    const balance = Number(inv.total_amount) - Number(inv.amount_paid);

    if (!supplierMap.has(supplierId)) {
      supplierMap.set(supplierId, {
        supplier_id: supplierId,
        supplier_name: supplierName,
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90plus: 0,
        total: 0,
        invoices: [],
      });
    }

    const entry = supplierMap.get(supplierId)!;

    // Calculate aging bucket from due date
    let bucket = 'current';
    if (inv.due_date) {
      const diffDays = Math.floor((now.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) bucket = 'current';
      else if (diffDays <= 30) bucket = '1-30';
      else if (diffDays <= 60) bucket = '31-60';
      else if (diffDays <= 90) bucket = '61-90';
      else bucket = '90+';
    }

    // Add to bucket totals
    switch (bucket) {
      case 'current':  entry.current += balance; break;
      case '1-30':     entry.days1_30 += balance; break;
      case '31-60':    entry.days31_60 += balance; break;
      case '61-90':    entry.days61_90 += balance; break;
      case '90+':      entry.days90plus += balance; break;
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

  // Summary totals
  const summary = {
    current: data.reduce((s, r) => s + r.current, 0),
    days1_30: data.reduce((s, r) => s + r.days1_30, 0),
    days31_60: data.reduce((s, r) => s + r.days31_60, 0),
    days61_90: data.reduce((s, r) => s + r.days61_90, 0),
    days90plus: data.reduce((s, r) => s + r.days90plus, 0),
    total: data.reduce((s, r) => s + r.total, 0),
  };

  return NextResponse.json({ data: { suppliers: data, summary }, error: null });
}
