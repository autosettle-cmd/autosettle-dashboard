/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaUnfiltered } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type ModelType = 'invoice' | 'salesInvoice' | 'claim' | 'payment';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const role = session.user.role;
    if (role !== 'accountant' && role !== 'admin' && role !== 'platform_owner') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { model, id } = await request.json() as { model: ModelType; id: string };
    if (!model || !id) {
      return NextResponse.json({ error: 'model and id are required' }, { status: 400 });
    }

    const validModels: ModelType[] = ['invoice', 'salesInvoice', 'claim', 'payment'];
    if (!validModels.includes(model)) {
      return NextResponse.json({ error: 'Invalid model type' }, { status: 400 });
    }

    // Verify the record exists and is soft-deleted
    const selectFields: any = { id: true, firm_id: true, deleted_at: true };
    if (model === 'invoice') Object.assign(selectFields, { invoice_number: true, file_hash: true });
    if (model === 'salesInvoice') Object.assign(selectFields, { invoice_number: true });
    if (model === 'claim') Object.assign(selectFields, { receipt_number: true, file_hash: true });

    const record = await (prismaUnfiltered as any)[model].findUnique({
      where: { id },
      select: selectFields,
    });

    if (!record || !record.deleted_at) {
      return NextResponse.json({ error: 'Record not found or not deleted' }, { status: 404 });
    }

    // Access check
    if (role === 'admin') {
      if (session.user.firm_id !== record.firm_id) {
        return NextResponse.json({ error: 'Not authorized for this firm' }, { status: 403 });
      }
    } else if (role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      if (firmIds && !firmIds.includes(record.firm_id)) {
        return NextResponse.json({ error: 'Not authorized for this firm' }, { status: 403 });
      }
    }

    // Block restore if a duplicate already exists (same doc was re-uploaded while deleted)
    if (model === 'invoice' && (record.invoice_number || record.file_hash)) {
      const where: any = { firm_id: record.firm_id, deleted_at: null, id: { not: id } };
      if (record.file_hash) where.file_hash = record.file_hash;
      else where.invoice_number = record.invoice_number;
      const dup = await prismaUnfiltered.invoice.findFirst({ where });
      if (dup) {
        return NextResponse.json({
          error: `Cannot restore — a matching invoice already exists. The same document may have been re-uploaded.`,
        }, { status: 409 });
      }
    }

    if (model === 'salesInvoice') {
      const existing = await prismaUnfiltered.salesInvoice.findFirst({
        where: { firm_id: record.firm_id, invoice_number: record.invoice_number, deleted_at: null, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json({
          error: `Cannot restore — invoice number ${record.invoice_number} is already in use.`,
        }, { status: 409 });
      }
    }

    if (model === 'claim' && (record.receipt_number || record.file_hash)) {
      const where: any = { firm_id: record.firm_id, deleted_at: null, id: { not: id } };
      if (record.file_hash) where.file_hash = record.file_hash;
      else where.receipt_number = record.receipt_number;
      const dup = await prismaUnfiltered.claim.findFirst({ where });
      if (dup) {
        return NextResponse.json({
          error: `Cannot restore — a matching claim/receipt already exists. The same document may have been re-uploaded.`,
        }, { status: 409 });
      }
    }

    // Restore: clear deleted_at/deleted_by
    const restoreData: any = { deleted_at: null, deleted_by: null };

    await (prismaUnfiltered as any)[model].update({
      where: { id },
      data: restoreData,
    });

    const tableNameMap: Record<ModelType, string> = {
      invoice: 'Invoice',
      salesInvoice: 'SalesInvoice',
      claim: 'Claim',
      payment: 'Payment',
    };

    await auditLog({
      firmId: record.firm_id,
      tableName: tableNameMap[model],
      recordId: id,
      action: 'restore',
      newValues: { restored: true },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: { restored: true }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
