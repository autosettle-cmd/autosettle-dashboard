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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    session.user.role !== 'employee' ||
    !session.user.employee_id
  ) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const employeeId = session.user.employee_id;

  const claims = await prisma.claim.findMany({
    where: { employee_id: employeeId },
    include: {
      category: { select: { name: true } },
    },
    orderBy: { claim_date: 'desc' },
  });

  const data = claims.map((c) => ({
    id: c.id,
    claim_date: c.claim_date,
    merchant: c.merchant,
    description: c.description,
    category_name: c.category.name,
    amount: c.amount.toString(),
    status: c.status,
    approval: c.approval,
    payment_status: c.payment_status,
    rejection_reason: c.rejection_reason,
    receipt_number: c.receipt_number,
    file_url: c.file_url,
    thumbnail_url: c.thumbnail_url,
    confidence: c.confidence,
  }));

  return NextResponse.json({ data, error: null, meta: { count: data.length } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    session.user.role !== 'employee' ||
    !session.user.employee_id
  ) {
    return NextResponse.json(
      { data: null, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  const employeeId = session.user.employee_id;
  const firmId = session.user.firm_id;

  if (!firmId) {
    return NextResponse.json(
      { data: null, error: 'Employee has no firm assigned' },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();

    const claimDate = formData.get('claim_date') as string | null;
    const merchant = formData.get('merchant') as string | null;
    const amountStr = formData.get('amount') as string | null;
    const categoryId = formData.get('category_id') as string | null;
    const receiptNumber = formData.get('receipt_number') as string | null;
    const description = formData.get('description') as string | null;
    const file = formData.get('file') as File | null;

    if (!claimDate || !merchant || !amountStr || !categoryId) {
      return NextResponse.json(
        {
          data: null,
          error:
            'Missing required fields: claim_date, merchant, amount, category_id',
        },
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

    // Upload file to Google Drive if present and credentials are configured
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
        console.warn(
          'Google Drive upload failed, creating claim without file URLs:',
          err
        );
      }
    } else {
      console.warn('No file provided with claim submission');
    }

    const claim = await prisma.claim.create({
      data: {
        firm_id: firmId,
        employee_id: employeeId,
        claim_date: new Date(claimDate),
        merchant,
        description: description || null,
        receipt_number: receiptNumber || null,
        amount,
        category_id: categoryId,
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
        category: { select: { name: true } },
      },
    });

    const data = {
      id: claim.id,
      claim_date: claim.claim_date,
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
