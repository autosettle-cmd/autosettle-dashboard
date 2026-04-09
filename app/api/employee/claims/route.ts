import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileForFirm } from '@/lib/google-drive';
import { getFirmMileageRate, calculateMileageAmount } from '@/lib/mileage';

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
    type: c.type,
    from_location: c.from_location,
    to_location: c.to_location,
    distance_km: c.distance_km?.toString() ?? null,
    trip_purpose: c.trip_purpose,
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
    const claimType = (formData.get('type') as string | null) || 'claim';

    if (claimType === 'mileage') {
      // ── Mileage claim ──
      const claimDate = formData.get('claim_date') as string | null;
      const fromLocation = formData.get('from_location') as string | null;
      const toLocation = formData.get('to_location') as string | null;
      const distanceStr = formData.get('distance_km') as string | null;
      const tripPurpose = formData.get('trip_purpose') as string | null;

      if (!claimDate || !fromLocation || !toLocation || !distanceStr || !tripPurpose) {
        return NextResponse.json(
          { data: null, error: 'Missing required fields: claim_date, from_location, to_location, distance_km, trip_purpose' },
          { status: 400 }
        );
      }

      const distanceKm = parseFloat(distanceStr);
      if (isNaN(distanceKm) || distanceKm <= 0) {
        return NextResponse.json({ data: null, error: 'Invalid distance' }, { status: 400 });
      }

      const rate = await getFirmMileageRate(firmId);
      const amount = calculateMileageAmount(distanceKm, rate);

      // Auto-resolve "Travel & Transport" category
      const category = await prisma.category.findFirst({
        where: {
          name: 'Travel & Transport',
          OR: [{ firm_id: firmId }, { firm_id: null }],
          is_active: true,
        },
      });

      if (!category) {
        return NextResponse.json({ data: null, error: 'Travel & Transport category not found' }, { status: 400 });
      }

      const claim = await prisma.claim.create({
        data: {
          firm_id: firmId,
          employee_id: employeeId,
          claim_date: new Date(claimDate),
          merchant: 'Mileage Claim',
          amount,
          category_id: category.id,
          status: 'pending_review',
          approval: 'pending_approval',
          payment_status: 'unpaid',
          confidence: 'HIGH',
          submitted_via: 'dashboard',
          type: 'mileage',
          from_location: fromLocation,
          to_location: toLocation,
          distance_km: distanceKm,
          trip_purpose: tripPurpose,
        },
        include: { category: { select: { name: true } } },
      });

      return NextResponse.json({
        data: {
          id: claim.id,
          claim_date: claim.claim_date,
          merchant: claim.merchant,
          category_name: claim.category.name,
          amount: claim.amount.toString(),
          status: claim.status,
          approval: claim.approval,
          payment_status: claim.payment_status,
          type: claim.type,
          from_location: claim.from_location,
          to_location: claim.to_location,
          distance_km: claim.distance_km?.toString(),
          trip_purpose: claim.trip_purpose,
        },
        error: null,
      }, { status: 201 });
    }

    // ── Receipt / standard claim ──
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
        const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
        const uploaded = await uploadFileForFirm(file, firmId, firm.name, 'claims');
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
