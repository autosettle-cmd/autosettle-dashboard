import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
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
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  const { searchParams } = new URL(request.url);
  const firmId = searchParams.get('firmId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const approval = searchParams.get('approval');
  const search = searchParams.get('search');
  const type = searchParams.get('type');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...firmScope(firmIds, firmId) };
  if (type && (type === 'claim' || type === 'receipt')) where.type = type;

  if (dateFrom || dateTo) {
    where.claim_date = {};
    if (dateFrom) where.claim_date.gte = new Date(dateFrom);
    if (dateTo) where.claim_date.lte = new Date(dateTo);
  }
  if (approval && approval !== 'all') where.approval = approval;
  if (search) {
    where.OR = [
      { merchant: { contains: search, mode: 'insensitive' } },
      { employee: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const claims = await prisma.claim.findMany({
    where,
    include: {
      employee: { select: { name: true } },
      firm: { select: { name: true } },
      category: { select: { name: true } },
      _count: { select: { paymentReceipts: true } },
      paymentReceipts: {
        include: {
          payment: {
            select: { id: true, amount: true, payment_date: true, reference: true, supplier: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { claim_date: 'desc' },
  });

  const data = claims.map((c) => ({
    id: c.id,
    claim_date: c.claim_date,
    employee_name: c.employee.name,
    firm_name: c.firm.name,
    firm_id: c.firm_id,
    merchant: c.merchant,
    description: c.description,
    category_name: c.category.name,
    category_id: c.category_id,
    amount: c.amount.toString(),
    status: c.status,
    approval: c.approval,
    payment_status: c.payment_status,
    rejection_reason: c.rejection_reason,
    thumbnail_url: c.thumbnail_url,
    file_url: c.file_url,
    confidence: c.confidence,
    receipt_number: c.receipt_number,
    type: c.type,
    linked_payment_count: c._count.paymentReceipts,
    linked_payments: c.paymentReceipts.map((pr) => ({
      payment_id: pr.payment.id,
      amount: pr.payment.amount.toString(),
      payment_date: pr.payment.payment_date,
      reference: pr.payment.reference,
      supplier_name: pr.payment.supplier.name,
    })),
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  try {
    const formData = await request.formData();

    const selectedFirmId = formData.get('firm_id') as string | null;
    const claimType = (formData.get('type') as string | null) || 'claim';
    const claimDate = formData.get('claim_date') as string | null;
    const merchant = formData.get('merchant') as string | null;
    const amountStr = formData.get('amount') as string | null;
    const categoryId = formData.get('category_id') as string | null;
    const receiptNumber = formData.get('receipt_number') as string | null;
    const description = formData.get('description') as string | null;
    const file = formData.get('file') as File | null;

    if (!selectedFirmId) {
      return NextResponse.json(
        { data: null, error: 'firm_id is required' },
        { status: 400 }
      );
    }

    // Validate firm access
    if (firmIds && !firmIds.includes(selectedFirmId)) {
      return NextResponse.json(
        { data: null, error: 'You do not have access to this firm' },
        { status: 403 }
      );
    }

    if (!claimDate || !merchant || !amountStr || !categoryId) {
      return NextResponse.json(
        { data: null, error: 'Missing required fields: claim_date, merchant, amount, category_id' },
        { status: 400 }
      );
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { data: null, error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Find an employee in the selected firm to attribute the claim to
    const employee = await prisma.employee.findFirst({
      where: { firm_id: selectedFirmId },
    });

    if (!employee) {
      return NextResponse.json(
        { data: null, error: 'No employee found in the selected firm' },
        { status: 400 }
      );
    }

    // Upload file to Google Drive if present
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
        console.warn('Google Drive upload failed, creating claim without file URLs:', err);
      }
    }

    const claim = await prisma.claim.create({
      data: {
        firm_id: selectedFirmId,
        employee_id: employee.id,
        claim_date: new Date(claimDate),
        merchant,
        description: description || null,
        receipt_number: receiptNumber || null,
        amount,
        category_id: categoryId,
        type: claimType as 'claim' | 'receipt',
        status: 'pending_review',
        approval: 'pending_approval',
        payment_status: 'unpaid',
        confidence: 'HIGH',
        submitted_via: 'dashboard',
        file_url: fileUrl,
        file_download_url: fileDownloadUrl,
        thumbnail_url: thumbnailUrl,
      },
      include: {
        employee: { select: { name: true } },
        firm: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    const data = {
      id: claim.id,
      claim_date: claim.claim_date,
      employee_name: claim.employee.name,
      firm_name: claim.firm.name,
      firm_id: claim.firm_id,
      merchant: claim.merchant,
      description: claim.description,
      category_name: claim.category.name,
      amount: claim.amount.toString(),
      status: claim.status,
      approval: claim.approval,
      payment_status: claim.payment_status,
      receipt_number: claim.receipt_number,
      file_url: claim.file_url,
      thumbnail_url: claim.thumbnail_url,
      type: claim.type,
    };

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating claim:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to create claim' },
      { status: 500 }
    );
  }
}
