import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { uploadFileForFirm } from '@/lib/google-drive';
import { createJournalEntry } from '@/lib/journal-entries';
import { createHash } from 'crypto';
import { resolveSupplier } from '@/lib/supplier-resolver';

export const dynamic = 'force-dynamic';

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
  const status = searchParams.get('status');
  const paymentStatus = searchParams.get('paymentStatus');
  const overdue = searchParams.get('overdue');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;
  const type = searchParams.get('type'); // 'purchase' | 'sales' | null (all)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope: any = { ...firmScope(firmIds, firmId) };
  if (type) scope.type = type;
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
  if (overdue === 'true') {
    extraFilters.due_date = { lt: new Date() };
    extraFilters.payment_status = { not: 'paid' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...scope, ...dateFilter, ...extraFilters };

  if (search) {
    const searchAmount = parseFloat(search);
    where.OR = [
      { vendor_name_raw: { contains: search, mode: 'insensitive' } },
      { invoice_number: { contains: search, mode: 'insensitive' } },
      ...(!isNaN(searchAmount) ? [{ total_amount: { equals: searchAmount } }] : []),
    ];
  }

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        uploader: { select: { name: true } },
        firm: { select: { name: true } },
        supplier: { select: { id: true, name: true, default_gl_account_id: true, default_contra_gl_account_id: true } },
        category: { select: { name: true } },
        glAccount: { select: { id: true, account_code: true, name: true } },
        contraGlAccount: { select: { id: true, account_code: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ issue_date: 'desc' }, { id: 'asc' }],
      take: takeParam || 100,
    }),
    prisma.invoice.count({ where }),
  ]);

  // Batch-load line items only for invoices that have them (avoids N+1 nested include)
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
    type: inv.type,
    vendor_name_raw: inv.vendor_name_raw,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    payment_terms: inv.payment_terms,
    currency: inv.currency,
    subtotal: inv.subtotal?.toString() ?? null,
    tax_amount: inv.tax_amount?.toString() ?? null,
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    category_name: inv.category?.name ?? null,
    category_id: inv.category_id,
    status: inv.status,
    payment_status: inv.payment_status,
    supplier_id: inv.supplier_id,
    supplier_name: inv.supplier?.name ?? null,
    supplier_link_status: inv.supplier_link_status,
    uploader_name: inv.uploader?.name ?? null,
    firm_name: inv.firm.name,
    firm_id: inv.firm_id,
    confidence: inv.confidence,
    file_url: inv.file_url,
    thumbnail_url: inv.thumbnail_url,
    notes: inv.notes,
    doc_subtype: inv.doc_subtype,
    submitted_via: inv.submitted_via,
    gl_account_id: inv.gl_account_id,
    gl_account_label: inv.glAccount ? `${inv.glAccount.account_code} — ${inv.glAccount.name}` : null,
    contra_gl_account_id: inv.contra_gl_account_id,
    contra_gl_account_label: inv.contraGlAccount ? `${inv.contraGlAccount.account_code} — ${inv.contraGlAccount.name}` : null,
    supplier_default_gl_id: inv.supplier?.default_gl_account_id ?? null,
    supplier_default_contra_gl_id: inv.supplier?.default_contra_gl_account_id ?? null,
    approval: inv.approval,
    rejection_reason: inv.rejection_reason,
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
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const firmIds = await getAccountantFirmIds(session.user.id);

  try {
    const formData = await request.formData();

    const firmId = formData.get('firm_id') as string | null;
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
    const docSubtype = formData.get('doc_subtype') as string | null; // 'credit_note' for CN
    const invoiceType = (formData.get('type') as string | null) || 'purchase'; // 'purchase' or 'sales'
    const currency = (formData.get('currency') as string | null) || 'MYR';
    const file = formData.get('file') as File | null;

    const isSalesInvoice = invoiceType === 'sales';

    if (!firmId || !issueDate || !totalAmountStr) {
      const missing = [!firmId && 'firm', !issueDate && 'issue date', !totalAmountStr && 'total amount'].filter(Boolean);
      return NextResponse.json(
        { data: null, error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }
    // vendor_name required for purchase invoices
    if (!isSalesInvoice && !vendorName) {
      return NextResponse.json(
        { data: null, error: 'Missing required field: vendor name' },
        { status: 400 }
      );
    }

    // Auto-assign "Miscellaneous" category if not provided (optional for sales invoices)
    let resolvedCategoryId = categoryId;
    if (!resolvedCategoryId && !isSalesInvoice) {
      const misc = await prisma.category.findFirst({ where: { name: 'Miscellaneous' }, select: { id: true } });
      if (!misc) {
        return NextResponse.json({ data: null, error: 'No default category found. Please select a category.' }, { status: 400 });
      }
      resolvedCategoryId = misc.id;
    }

    // Validate accountant has access to this firm
    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json(
        { data: null, error: 'You do not have access to this firm' },
        { status: 403 }
      );
    }

    const totalAmount = parseFloat(totalAmountStr);
    if (isNaN(totalAmount) || totalAmount === 0) {
      return NextResponse.json(
        { data: null, error: 'Invalid total_amount' },
        { status: 400 }
      );
    }

    // Find an employee record to use as uploaded_by — use the first admin employee in the firm
    const uploaderEmployee = await prisma.employee.findFirst({
      where: { firm_id: firmId },
      orderBy: { created_at: 'asc' },
    });

    if (!uploaderEmployee) {
      return NextResponse.json(
        { data: null, error: 'No employee found in this firm to assign as uploader' },
        { status: 400 }
      );
    }

    // ── Supplier matching (skip for sales invoices without vendor name) ──
    let supplierId: string | null = null;
    let linkStatus: 'auto_matched' | 'unmatched' | 'confirmed' = 'unmatched';

    if (vendorName) {
      if (supplierIdParam) {
        // User explicitly selected an existing supplier
        supplierId = supplierIdParam;
        linkStatus = 'confirmed';
        const normalizedVendor = vendorName.toLowerCase().trim();
        const existingAlias = await prisma.supplierAlias.findFirst({
          where: { alias: normalizedVendor, supplier_id: supplierIdParam },
        });
        if (!existingAlias) {
          await prisma.supplierAlias.create({
            data: { supplier_id: supplierIdParam, alias: normalizedVendor, is_confirmed: true },
          }).catch(() => {});
        }
      } else {
        const resolved = await resolveSupplier(vendorName, firmId);
        supplierId = resolved.supplierId;
        linkStatus = resolved.linkStatus;
      }
    } else if (supplierIdParam) {
      supplierId = supplierIdParam;
      linkStatus = 'confirmed';
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
        where: { firm_id: firmId!, file_hash: fileHash },
        select: { id: true, vendor_name_raw: true, invoice_number: true },
      });
      if (hashDupe) {
        return NextResponse.json(
          { data: null, error: `Duplicate file: this exact document was already uploaded${hashDupe.invoice_number ? ` as ${hashDupe.invoice_number}` : ''} (${hashDupe.vendor_name_raw})` },
          { status: 409 }
        );
      }
    }
    // 1. Invoice number match (case-insensitive, with/without # prefix)
    if (invoiceNumber) {
      const stripped = invoiceNumber.replace(/^[#\s]+/, '').trim();
      const existing = await prisma.invoice.findFirst({
        where: {
          firm_id: firmId!,
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
    // 2. Composite match: same vendor + issue date + amount (catches renamed/renumbered dupes)
    if (vendorName && issueDate && totalAmount) {
      const compositeMatch = await prisma.invoice.findFirst({
        where: {
          firm_id: firmId!,
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

    // ── Resolve contra GL for auto-approve ──
    let resolvedContraGlId = contraGlAccountId;
    if (!resolvedContraGlId && supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { default_contra_gl_account_id: true } });
      resolvedContraGlId = supplier?.default_contra_gl_account_id ?? null;
    }
    if (!resolvedContraGlId) {
      const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { default_trade_payables_gl_id: true } });
      resolvedContraGlId = firm?.default_trade_payables_gl_id ?? null;
    }

    // Accountant upload → auto-approve if GL accounts are available
    // Auto-approve only for single uploads where GL accounts are provided
    const canAutoApprove = !isBatch && !!(glAccountId && resolvedContraGlId);

    // ── Create invoice (+ JV + supplier learning in transaction if auto-approve) ──
    const invoice = canAutoApprove
      ? await prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              firm_id: firmId,
              type: invoiceType,
              uploaded_by: uploaderEmployee.id,
              supplier_id: supplierId,
              supplier_link_status: supplierId ? 'confirmed' : linkStatus,
              vendor_name_raw: vendorName || null,
              invoice_number: invoiceNumber || null,
              issue_date: new Date(issueDate),
              due_date: computedDueDate ? new Date(computedDueDate) : null,
              payment_terms: paymentTerms || null,
              currency,
              notes: notes || null,
              doc_subtype: docSubtype || null,
              total_amount: totalAmount,
              category_id: resolvedCategoryId || null,
              gl_account_id: glAccountId || null,
              contra_gl_account_id: resolvedContraGlId || null,
              confidence: isSalesInvoice ? undefined : 'HIGH',
              status: 'reviewed',
              approval: 'approved',
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
              supplier: { select: { id: true, name: true, default_gl_account_id: true } },
            },
          });

          // Create JV inside same transaction
          const absAmount = Math.abs(totalAmount);
          const isCreditNote = totalAmount < 0;
          await createJournalEntry({
            firmId,
            postingDate: new Date(issueDate),
            description: `${isCreditNote ? 'Credit Note' : inv.category?.name ?? 'Sales'} — ${vendorName || 'Customer'}`,
            sourceType: isSalesInvoice ? 'sales_invoice_posting' : 'invoice_posting',
            sourceId: inv.id,
            lines: isCreditNote
              ? [
                  { glAccountId: resolvedContraGlId!, debitAmount: absAmount, creditAmount: 0, description: 'Trade Payables (reversal)' },
                  { glAccountId: glAccountId!, debitAmount: 0, creditAmount: absAmount, description: vendorName || 'Customer' },
                ]
              : [
                  { glAccountId: glAccountId!, debitAmount: absAmount, creditAmount: 0, description: vendorName || 'Customer' },
                  { glAccountId: resolvedContraGlId!, debitAmount: 0, creditAmount: absAmount, description: 'Trade Payables' },
                ],
            createdBy: session.user.id,
            tx,
          });

          // Save GL to supplier for future auto-fill
          if (supplierId) {
            const updates: Record<string, string> = {};
            if (!inv.supplier?.default_gl_account_id) updates.default_gl_account_id = glAccountId!;
            if (contraGlAccountId) updates.default_contra_gl_account_id = contraGlAccountId;
            if (Object.keys(updates).length > 0) {
              await tx.supplier.update({ where: { id: supplierId }, data: updates });
            }
          }

          return inv;
        })
      : await prisma.invoice.create({
          data: {
            firm_id: firmId,
            type: invoiceType,
            uploaded_by: uploaderEmployee.id,
            supplier_id: supplierId,
            supplier_link_status: linkStatus,
            vendor_name_raw: vendorName || null,
            invoice_number: invoiceNumber || null,
            issue_date: new Date(issueDate),
            due_date: computedDueDate ? new Date(computedDueDate) : null,
            payment_terms: paymentTerms || null,
            currency,
            notes: notes || null,
            doc_subtype: docSubtype || null,
            total_amount: totalAmount,
            category_id: resolvedCategoryId || null,
            gl_account_id: glAccountId || null,
            contra_gl_account_id: resolvedContraGlId || null,
            confidence: isSalesInvoice ? undefined : 'HIGH',
            status: isSalesInvoice ? 'reviewed' : 'reviewed',
            approval: 'pending_approval',
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
      type: invoice.type,
      vendor_name_raw: invoice.vendor_name_raw,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_amount: invoice.total_amount.toString(),
      category_name: invoice.category?.name ?? null,
      supplier_name: invoice.supplier?.name ?? null,
      supplier_link_status: invoice.supplier_link_status,
      status: invoice.status,
      approval: invoice.approval,
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
