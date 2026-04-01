import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { Readable } from 'stream';

async function uploadToGoogleDrive(
  file: File
): Promise<{ fileUrl: string; downloadUrl: string; thumbnailUrl: string }> {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}'
  );
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!credentials.client_email || !folderId) {
    throw new Error('Google Drive credentials not configured');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const buffer = Buffer.from(await file.arrayBuffer());
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: file.name,
      parents: [folderId],
    },
    media: {
      mimeType: file.type,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink, thumbnailLink',
  });

  const fileId = response.data.id!;

  // Make file publicly accessible
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileUrl:
      response.data.webViewLink ||
      `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl:
      response.data.webContentLink ||
      `https://drive.google.com/uc?export=download&id=${fileId}`,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const status = searchParams.get('status');
  const paymentStatus = searchParams.get('paymentStatus');
  const supplierId = searchParams.get('supplierId');
  const overdue = searchParams.get('overdue');
  const search = searchParams.get('search');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };

  if (dateFrom || dateTo) {
    where.issue_date = {};
    if (dateFrom) where.issue_date.gte = new Date(dateFrom);
    if (dateTo) where.issue_date.lte = new Date(dateTo);
  }
  if (status && status !== 'all') where.status = status;
  if (paymentStatus && paymentStatus !== 'all') where.payment_status = paymentStatus;
  if (supplierId) where.supplier_id = supplierId;
  if (overdue === 'true') {
    where.due_date = { lt: new Date() };
    where.payment_status = { not: 'paid' };
  }
  if (search) {
    where.OR = [
      { vendor_name_raw: { contains: search, mode: 'insensitive' } },
      { invoice_number: { contains: search, mode: 'insensitive' } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      uploader: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      category: { select: { name: true } },
    },
    orderBy: { issue_date: 'desc' },
  });

  const data = invoices.map((inv) => ({
    id: inv.id,
    vendor_name_raw: inv.vendor_name_raw,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    payment_terms: inv.payment_terms,
    subtotal: inv.subtotal?.toString() ?? null,
    tax_amount: inv.tax_amount?.toString() ?? null,
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    category_name: inv.category.name,
    category_id: inv.category_id,
    status: inv.status,
    payment_status: inv.payment_status,
    supplier_id: inv.supplier_id,
    supplier_name: inv.supplier?.name ?? null,
    supplier_link_status: inv.supplier_link_status,
    uploader_name: inv.uploader.name,
    confidence: inv.confidence,
    file_url: inv.file_url,
    thumbnail_url: inv.thumbnail_url,
    submitted_via: inv.submitted_via,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;
  const employeeId = session.user.employee_id;

  if (!employeeId) {
    return NextResponse.json(
      { data: null, error: 'Admin has no employee record linked' },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();

    const vendorName = formData.get('vendor_name') as string | null;
    const invoiceNumber = formData.get('invoice_number') as string | null;
    const issueDate = formData.get('issue_date') as string | null;
    const dueDate = formData.get('due_date') as string | null;
    const totalAmountStr = formData.get('total_amount') as string | null;
    const categoryId = formData.get('category_id') as string | null;
    const paymentTerms = formData.get('payment_terms') as string | null;
    const file = formData.get('file') as File | null;

    if (!vendorName || !issueDate || !totalAmountStr || !categoryId) {
      return NextResponse.json(
        { data: null, error: 'Missing required fields: vendor_name, issue_date, total_amount, category_id' },
        { status: 400 }
      );
    }

    const totalAmount = parseFloat(totalAmountStr);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { data: null, error: 'Invalid total_amount' },
        { status: 400 }
      );
    }

    // ── Supplier matching (same logic as lib/whatsapp/invoices.ts) ──
    const normalizedVendor = vendorName.toLowerCase().trim();

    const existingAlias = await prisma.supplierAlias.findFirst({
      where: {
        alias: normalizedVendor,
        supplier: { firm_id: firmId },
      },
      include: { supplier: true },
    });

    let supplierId: string;
    let linkStatus: 'auto_matched' | 'unmatched' | 'confirmed';

    if (existingAlias) {
      supplierId = existingAlias.supplier_id;
      linkStatus = existingAlias.is_confirmed ? 'confirmed' : 'auto_matched';
    } else {
      const newSupplier = await prisma.supplier.create({
        data: {
          firm_id: firmId,
          name: vendorName,
          aliases: {
            create: {
              alias: normalizedVendor,
              is_confirmed: false,
            },
          },
        },
      });
      supplierId = newSupplier.id;
      linkStatus = 'unmatched';
    }

    // ── Calculate due date from payment terms if not provided ──
    let computedDueDate = dueDate || null;
    if (!computedDueDate && paymentTerms && issueDate) {
      const daysMatch =
        paymentTerms.match(/(\d+)\s*(?:days?|d)/i) ??
        paymentTerms.match(/net\s*(\d+)/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        const d = new Date(issueDate);
        d.setDate(d.getDate() + days);
        computedDueDate = d.toISOString().split('T')[0];
      }
    }

    // ── Upload file to Google Drive ──
    let fileUrl: string | null = null;
    let fileDownloadUrl: string | null = null;
    let thumbnailUrl: string | null = null;

    if (file) {
      try {
        const uploaded = await uploadToGoogleDrive(file);
        fileUrl = uploaded.fileUrl;
        fileDownloadUrl = uploaded.downloadUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
      } catch (err) {
        console.warn('Google Drive upload failed, creating invoice without file URLs:', err);
      }
    }

    // ── Create the invoice ──
    const invoice = await prisma.invoice.create({
      data: {
        firm_id: firmId,
        uploaded_by: employeeId,
        supplier_id: supplierId,
        supplier_link_status: linkStatus,
        vendor_name_raw: vendorName,
        invoice_number: invoiceNumber || null,
        issue_date: new Date(issueDate),
        due_date: computedDueDate ? new Date(computedDueDate) : null,
        payment_terms: paymentTerms || null,
        total_amount: totalAmount,
        category_id: categoryId,
        confidence: 'HIGH',
        status: 'pending_review',
        payment_status: 'unpaid',
        amount_paid: 0,
        file_url: fileUrl,
        file_download_url: fileDownloadUrl,
        thumbnail_url: thumbnailUrl,
        submitted_via: 'dashboard',
      },
      include: {
        category: { select: { name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    const data = {
      id: invoice.id,
      vendor_name_raw: invoice.vendor_name_raw,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount.toString(),
      category_name: invoice.category.name,
      supplier_name: invoice.supplier?.name ?? null,
      supplier_link_status: invoice.supplier_link_status,
      status: invoice.status,
      payment_status: invoice.payment_status,
    };

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
