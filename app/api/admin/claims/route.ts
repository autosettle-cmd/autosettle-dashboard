import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileForFirm } from '@/lib/google-drive';
import { getFirmMileageRate, calculateMileageAmount } from '@/lib/mileage';
import { checkClaimDuplicate } from '@/lib/claim-dedup';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

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
  const approval = searchParams.get('approval');
  const search = searchParams.get('search');
  const type = searchParams.get('type');
  const employeeId = searchParams.get('employeeId');
  const paymentStatus = searchParams.getAll('paymentStatus');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { firm_id: firmId };
  if (type && (type === 'claim' || type === 'receipt' || type === 'mileage')) where.type = type;
  if (employeeId) where.employee_id = employeeId;
  if (paymentStatus.length === 1) where.payment_status = paymentStatus[0];
  else if (paymentStatus.length > 1) where.payment_status = { in: paymentStatus };

  if (dateFrom || dateTo) {
    // Always include pending_review items of the SAME type regardless of date range
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outstandingFilter: any = { status: 'pending_review' };
    if (type) outstandingFilter.type = type;
    if (!where.AND) where.AND = [];
    where.AND.push({ OR: [{ claim_date: dateFilter }, outstandingFilter] });
  }
  if (status && status !== 'all') where.status = status;
  if (approval && approval !== 'all') where.approval = approval;
  if (search) {
    if (!where.AND) where.AND = [];
    where.AND.push({ OR: [
      { merchant: { contains: search, mode: 'insensitive' } },
      { employee: { name: { contains: search, mode: 'insensitive' } } },
      { receipt_number: { contains: search, mode: 'insensitive' } },
    ]});
  }

  const [claims, totalCount] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: {
        employee: { select: { name: true } },
        category: { select: { name: true } },
        _count: { select: { paymentReceipts: true, invoiceReceiptLinks: true } },
        paymentReceipts: {
          include: {
            payment: {
              select: { id: true, amount: true, payment_date: true, reference: true, supplier: { select: { name: true } }, employee: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { claim_date: 'desc' },
      take: takeParam || 100,
    }),
    prisma.claim.count({ where }),
  ]);

  const data = claims.map((c) => ({
    id: c.id,
    claim_date: c.claim_date,
    employee_id: c.employee_id,
    employee_name: c.employee.name,
    merchant: c.merchant,
    description: c.description,
    category_name: c.category.name,
    category_id: c.category_id,
    amount: c.amount.toString(),
    status: c.status,
    approval: c.approval,
    payment_status: c.payment_status,
    amount_paid: c.amount_paid.toString(),
    rejection_reason: c.rejection_reason,
    receipt_number: c.receipt_number,
    file_url: c.file_url,
    thumbnail_url: c.thumbnail_url,
    confidence: c.confidence,
    submitted_via: c.submitted_via,
    type: c.type,
    from_location: c.from_location,
    to_location: c.to_location,
    distance_km: c.distance_km?.toString() ?? null,
    trip_purpose: c.trip_purpose,
    linked_payment_count: c._count.paymentReceipts + c._count.invoiceReceiptLinks,
    linked_payments: c.paymentReceipts.map((pr) => ({
      payment_id: pr.payment.id,
      amount: pr.payment.amount.toString(),
      payment_date: pr.payment.payment_date,
      reference: pr.payment.reference,
      supplier_name: pr.payment.supplier?.name ?? pr.payment.employee?.name ?? 'Unknown',
    })),
  }));

  return NextResponse.json({ data, error: null, hasMore: totalCount > (takeParam || 100), totalCount });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmId = session.user.firm_id;

  try {
    const formData = await request.formData();
    const employeeIdParam = formData.get('employee_id') as string | null;

    // Use provided employee_id, or admin's linked employee, or first employee in firm
    let employee;
    if (employeeIdParam) {
      employee = await prisma.employee.findUnique({ where: { id: employeeIdParam } });
      if (employee && employee.firm_id !== firmId) employee = null;
    } else {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { employee_id: true },
      });
      employee = user?.employee_id
        ? await prisma.employee.findUnique({ where: { id: user.employee_id } })
        : await prisma.employee.findFirst({ where: { firm_id: firmId } });
    }

    if (!employee) {
      return NextResponse.json(
        { data: null, error: 'No employee record found' },
        { status: 400 }
      );
    }
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

      // ── Duplicate check ──
      const mileageDedup = await checkClaimDuplicate({
        firmId,
        employeeId: employee.id,
        claimDate: new Date(claimDate),
        merchant: 'Mileage Claim',
        amount,
        type: 'mileage',
        fromLocation,
        toLocation,
        distanceKm,
      });
      if (mileageDedup.isDuplicate) {
        return NextResponse.json({ data: null, error: mileageDedup.message }, { status: 409 });
      }

      const claim = await prisma.claim.create({
        data: {
          firm_id: firmId,
          employee_id: employee.id,
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
        include: {
          employee: { select: { name: true } },
          category: { select: { name: true } },
        },
      });

      return NextResponse.json({
        data: {
          id: claim.id,
          claim_date: claim.claim_date,
          employee_name: claim.employee.name,
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

    // Upload file to Google Drive if present (convert HEIC to JPEG first)
    let fileUrl: string | null = null;
    let fileDownloadUrl: string | null = null;
    let thumbnailUrl: string | null = null;

    let uploadFile: File = file!;
    if (file) {
      const fn = file.name.toLowerCase();
      if (fn.endsWith('.heic') || fn.endsWith('.heif')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const heicConvert = require('heic-convert');
        const buf = Buffer.from(await file.arrayBuffer());
        const jpegBuf = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.85 });
        const jpegName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        uploadFile = new File([jpegBuf], jpegName, { type: 'image/jpeg' });
      }

      try {
        const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
        const uploaded = await uploadFileForFirm(uploadFile, firmId, firm.name, 'claims');
        fileUrl = uploaded.fileUrl;
        fileDownloadUrl = uploaded.downloadUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
      } catch (err) {
        console.warn('Google Drive upload failed, creating claim without file URLs:', err);
      }
    }

    // ── File hash duplicate check ──
    let fileHash: string | null = null;
    if (file) {
      const hashBuf = Buffer.from(await file.arrayBuffer());
      fileHash = createHash('sha256').update(hashBuf).digest('hex');
      const hashDupe = await prisma.claim.findFirst({
        where: { firm_id: firmId, file_hash: fileHash },
        select: { id: true, merchant: true, receipt_number: true },
      });
      if (hashDupe) {
        return NextResponse.json(
          { data: null, error: `Duplicate file: this exact document was already uploaded${hashDupe.receipt_number ? ` as ${hashDupe.receipt_number}` : ''} (${hashDupe.merchant})` },
          { status: 409 }
        );
      }
    }

    // ── Duplicate check ──
    const dedup = await checkClaimDuplicate({
      firmId,
      employeeId: employee.id,
      claimDate: new Date(claimDate),
      merchant,
      amount,
      receiptNumber,
      type: claimType as 'claim' | 'receipt',
    });
    if (dedup.isDuplicate) {
      return NextResponse.json({ data: null, error: dedup.message }, { status: 409 });
    }

    const claim = await prisma.claim.create({
      data: {
        firm_id: firmId,
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
        file_hash: fileHash,
      },
      include: {
        employee: { select: { name: true } },
        category: { select: { name: true } },
      },
    });

    const data = {
      id: claim.id,
      claim_date: claim.claim_date,
      employee_name: claim.employee.name,
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
