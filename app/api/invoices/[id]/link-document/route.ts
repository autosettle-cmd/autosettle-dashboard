import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/invoices/[id]/link-document
 * Link an existing invoice's document to a PV (payment voucher) that has no document.
 * Copies file_url, file_download_url, thumbnail_url from the source invoice.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  const sourceInvoiceId = body.sourceInvoiceId as string;

  if (!sourceInvoiceId) {
    return NextResponse.json({ data: null, error: 'sourceInvoiceId is required' }, { status: 400 });
  }

  // Load target PV
  const target = await prisma.invoice.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  // Auth check
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(target.firm_id)) {
      return NextResponse.json({ data: null, error: 'Not authorized' }, { status: 403 });
    }
  }

  if (!target.invoice_number?.startsWith('PV-')) {
    return NextResponse.json({ data: null, error: 'Only payment vouchers (PV-) can link documents' }, { status: 400 });
  }
  if (target.file_url) {
    return NextResponse.json({ data: null, error: 'This invoice already has a document' }, { status: 400 });
  }

  // Load source invoice
  const source = await prisma.invoice.findUnique({
    where: { id: sourceInvoiceId },
    select: { firm_id: true, file_url: true, file_download_url: true, thumbnail_url: true, invoice_number: true, vendor_name_raw: true },
  });
  if (!source || source.firm_id !== target.firm_id) {
    return NextResponse.json({ data: null, error: 'Source invoice not found' }, { status: 404 });
  }
  if (!source.file_url) {
    return NextResponse.json({ data: null, error: 'Source invoice has no document' }, { status: 400 });
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      file_url: source.file_url,
      file_download_url: source.file_download_url,
      thumbnail_url: source.thumbnail_url,
    },
  });

  return NextResponse.json({
    data: { success: true, linked_from: source.invoice_number },
    error: null,
  });
}
