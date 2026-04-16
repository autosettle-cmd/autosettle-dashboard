import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/invoices/check-duplicate
 * Quick file hash check before OCR — returns duplicate info if found.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const firmIdParam = formData.get('firm_id') as string | null;
  const firmId = firmIdParam || (session.user.role === 'admin' ? session.user.firm_id : null);

  if (!file || !firmId) {
    return NextResponse.json({ data: { isDuplicate: false }, error: null });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buf).digest('hex');

  // Check invoices
  const invoiceDupe = await prisma.invoice.findFirst({
    where: { firm_id: firmId, file_hash: fileHash },
    select: { id: true, vendor_name_raw: true, invoice_number: true },
  });

  if (invoiceDupe) {
    return NextResponse.json({
      data: {
        isDuplicate: true,
        message: `Duplicate file: this document was already uploaded${invoiceDupe.invoice_number ? ` as ${invoiceDupe.invoice_number}` : ''} (${invoiceDupe.vendor_name_raw})`,
      },
      error: null,
    });
  }

  // Check claims too
  const claimDupe = await prisma.claim.findFirst({
    where: { firm_id: firmId, file_hash: fileHash },
    select: { id: true, merchant: true, receipt_number: true },
  });

  if (claimDupe) {
    return NextResponse.json({
      data: {
        isDuplicate: true,
        message: `Duplicate file: this document was already uploaded as a claim${claimDupe.receipt_number ? ` (${claimDupe.receipt_number})` : ''} — ${claimDupe.merchant}`,
      },
      error: null,
    });
  }

  return NextResponse.json({ data: { isDuplicate: false, fileHash }, error: null });
}
