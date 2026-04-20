import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadFileForFirm } from '@/lib/google-drive';
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
  const paymentStatus = searchParams.get('paymentStatus');
  const supplierId = searchParams.get('supplierId');
  const overdue = searchParams.get('overdue');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope: any = { firm_id: firmId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateFilter: any = {};
  if (dateFrom || dateTo) {
    dateFilter.issue_date = {};
    if (dateFrom) dateFilter.issue_date.gte = new Date(dateFrom);
    if (dateTo) dateFilter.issue_date.lte = new Date(dateTo);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraFilters: any = {};
  if (status && status !== 'all') extraFilters.status = status;
  if (paymentStatus && paymentStatus !== 'all') extraFilters.payment_status = paymentStatus;
  if (supplierId) extraFilters.supplier_id = supplierId;
  if (overdue === 'true') {
    extraFilters.due_date = { lt: new Date() };
    extraFilters.payment_status = { not: 'paid' };
  }

  // Always show pending review (admin) regardless of date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let where: any;
  const hasDates = dateFrom || dateTo;
  if (hasDates && !search) {
    where = {
      ...scope,
      ...extraFilters,
      OR: [
        dateFilter,
        { status: 'pending_review' },
      ],
    };
  } else {
    where = { ...scope, ...dateFilter, ...extraFilters };
  }

  if (search) {
    where.OR = [
      { vendor_name_raw: { contains: search, mode: 'insensitive' } },
      { invoice_number: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        uploader: { select: { name: true } },
        supplier: { select: { id: true, name: true } },
        category: { select: { name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { issue_date: 'desc' },
      take: takeParam || 100,
    }),
    prisma.invoice.count({ where }),
  ]);

  // Batch-load line items separately
  const invoiceIdsWithLines = invoices.filter(inv => inv._count.lines > 0).map(inv => inv.id);
  const allLines = invoiceIdsWithLines.length > 0
    ? await prisma.invoiceLine.findMany({
        where: { invoice_id: { in: invoiceIdsWithLines } },
        include: { glAccount: { select: { id: true, account_code: true, name: true } } },
        orderBy: { sort_order: 'asc' },
      })
    : [];
  const linesByInvoice = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const arr = linesByInvoice.get(line.invoice_id) ?? [];
    arr.push(line);
    linesByInvoice.set(line.invoice_id, arr);
  }

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
    notes: inv.notes,
    submitted_via: inv.submitted_via,
    lines: (linesByInvoice.get(inv.id) ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity.toString(),
      unit_price: l.unit_price.toString(),
      tax_amount: l.tax_amount.toString(),
      line_total: l.line_total.toString(),
      gl_account_id: l.gl_account_id,
      gl_account_label: l.glAccount ? `${l.glAccount.account_code} — ${l.glAccount.name}` : null,
      sort_order: l.sort_order,
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
    const supplierIdParam = formData.get('supplier_id') as string | null;
    const invoiceNumber = formData.get('invoice_number') as string | null;
    const issueDate = formData.get('issue_date') as string | null;
    const dueDate = formData.get('due_date') as string | null;
    const totalAmountStr = formData.get('total_amount') as string | null;
    const categoryId = formData.get('category_id') as string | null;
    const paymentTerms = formData.get('payment_terms') as string | null;
    const notes = formData.get('notes') as string | null;
    const glAccountId = formData.get('gl_account_id') as string | null;
    const contraGlAccountId = formData.get('contra_gl_account_id') as string | null;
    const isBatch = formData.get('batch') === 'true';
    const file = formData.get('file') as File | null;

    if (!vendorName || !issueDate || !totalAmountStr) {
      return NextResponse.json(
        { data: null, error: 'Missing required fields: vendor_name, issue_date, total_amount' },
        { status: 400 }
      );
    }

    // Auto-assign "Miscellaneous" category if not provided
    let resolvedCategoryId = categoryId;
    if (!resolvedCategoryId) {
      const misc = await prisma.category.findFirst({ where: { name: 'Miscellaneous' }, select: { id: true } });
      if (!misc) {
        return NextResponse.json({ data: null, error: 'No default category found. Please select a category.' }, { status: 400 });
      }
      resolvedCategoryId = misc.id;
    }

    const totalAmount = parseFloat(totalAmountStr);
    if (isNaN(totalAmount) || totalAmount === 0) {
      return NextResponse.json(
        { data: null, error: 'Invalid total_amount' },
        { status: 400 }
      );
    }

    // ── Supplier matching ──
    let supplierId: string;
    let linkStatus: 'auto_matched' | 'unmatched' | 'confirmed';

    if (supplierIdParam) {
      // User explicitly selected an existing supplier from the dropdown
      supplierId = supplierIdParam;
      linkStatus = 'confirmed';
      // Add vendor name as alias if not already present
      const normalizedVendor = vendorName.toLowerCase().trim();
      const existingAlias = await prisma.supplierAlias.findFirst({
        where: { alias: normalizedVendor, supplier_id: supplierIdParam },
      });
      if (!existingAlias) {
        await prisma.supplierAlias.create({
          data: { supplier_id: supplierIdParam, alias: normalizedVendor, is_confirmed: true },
        }).catch(() => {}); // ignore if unique constraint fails
      }
    } else {
      // No supplier selected — try alias matching, then create new
      const normalizedVendor = vendorName.toLowerCase().trim();

      const existingAlias = await prisma.supplierAlias.findFirst({
        where: {
          alias: normalizedVendor,
          supplier: { firm_id: firmId },
        },
        include: { supplier: true },
      });

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
        const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
        const uploaded = await uploadFileForFirm(file, firmId, firm.name, 'invoices');
        fileUrl = uploaded.fileUrl;
        fileDownloadUrl = uploaded.downloadUrl;
        thumbnailUrl = uploaded.thumbnailUrl;
      } catch (err) {
        console.warn('Google Drive upload failed, creating invoice without file URLs:', err);
      }
    }

    // ── Duplicate check ──
    // 0. File hash — exact same file
    let fileHash: string | null = null;
    if (file) {
      const buf = Buffer.from(await file.arrayBuffer());
      fileHash = createHash('sha256').update(buf).digest('hex');
      const hashDupe = await prisma.invoice.findFirst({
        where: { firm_id: firmId, file_hash: fileHash },
        select: { id: true, vendor_name_raw: true, invoice_number: true },
      });
      if (hashDupe) {
        return NextResponse.json(
          { data: null, error: `Duplicate file: this exact document was already uploaded${hashDupe.invoice_number ? ` as ${hashDupe.invoice_number}` : ''} (${hashDupe.vendor_name_raw})` },
          { status: 409 }
        );
      }
    }
    if (invoiceNumber) {
      const stripped = invoiceNumber.replace(/^[#\s]+/, '').trim();
      const existing = await prisma.invoice.findFirst({
        where: {
          firm_id: firmId,
          OR: [
            { invoice_number: { equals: invoiceNumber, mode: 'insensitive' } },
            { invoice_number: { equals: stripped, mode: 'insensitive' } },
            { invoice_number: { equals: `#${stripped}`, mode: 'insensitive' } },
          ],
        },
        select: { id: true, vendor_name_raw: true, invoice_number: true },
      });
      if (existing) {
        return NextResponse.json(
          { data: null, error: `Duplicate: invoice #${existing.invoice_number} already exists (${existing.vendor_name_raw})` },
          { status: 409 }
        );
      }
    }
    // 2. Composite match: same vendor + issue date + amount
    if (vendorName && issueDate && totalAmount) {
      const compositeMatch = await prisma.invoice.findFirst({
        where: {
          firm_id: firmId,
          vendor_name_raw: { equals: vendorName, mode: 'insensitive' },
          issue_date: new Date(issueDate),
          total_amount: { gte: totalAmount - 0.01, lte: totalAmount + 0.01 },
        },
        select: { id: true, vendor_name_raw: true, invoice_number: true },
      });
      if (compositeMatch) {
        return NextResponse.json(
          { data: null, error: `Possible duplicate: ${compositeMatch.vendor_name_raw} on ${issueDate} for the same amount already exists${compositeMatch.invoice_number ? ` (${compositeMatch.invoice_number})` : ''}` },
          { status: 409 }
        );
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
        notes: notes || null,
        total_amount: totalAmount,
        category_id: resolvedCategoryId!,
        gl_account_id: glAccountId || null,
        contra_gl_account_id: contraGlAccountId || null,
        confidence: 'HIGH',
        status: isBatch ? 'pending_review' : 'reviewed',
        payment_status: 'unpaid',
        amount_paid: 0,
        file_url: fileUrl,
        file_download_url: fileDownloadUrl,
        thumbnail_url: thumbnailUrl,
        file_hash: fileHash,
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
