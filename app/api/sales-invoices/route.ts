import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, firmScope } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';
import { createJournalEntry, findOpenPeriod } from '@/lib/journal-entries';
import { uploadFileForFirm } from '@/lib/google-drive';
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
  const supplierId = searchParams.get('supplierId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const paymentStatus = searchParams.get('paymentStatus');
  const search = searchParams.get('search');
  const takeParam = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope: any = { ...firmScope(firmIds, firmId) };
  if (supplierId) scope.supplier_id = supplierId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateFilter: any = {};
  if (dateFrom || dateTo) {
    dateFilter.issue_date = {};
    if (dateFrom) dateFilter.issue_date.gte = new Date(dateFrom);
    if (dateTo) dateFilter.issue_date.lte = new Date(dateTo);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraFilters: any = {};
  if (paymentStatus && paymentStatus !== 'all') extraFilters.payment_status = paymentStatus;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { ...scope, ...dateFilter, ...extraFilters };

  if (search) {
    where.OR = [
      { invoice_number: { contains: search, mode: 'insensitive' } },
      { buyer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [salesInvoices, totalCount] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true } },
        firm: { select: { name: true } },
        category: { select: { name: true } },
        glAccount: { select: { account_code: true, name: true } },
        items: { orderBy: { sort_order: 'asc' } },
        paymentAllocations: {
          select: { id: true, amount: true },
        },
      },
      orderBy: [{ issue_date: 'desc' }, { id: 'asc' }],
      take: takeParam || 100,
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  const data = salesInvoices.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    currency: inv.currency,
    subtotal: inv.subtotal.toString(),
    tax_amount: inv.tax_amount.toString(),
    total_amount: inv.total_amount.toString(),
    amount_paid: inv.amount_paid.toString(),
    payment_status: inv.payment_status,
    notes: inv.notes,
    doc_subtype: inv.doc_subtype,
    supplier_id: inv.supplier_id,
    buyer_name: inv.buyer.name,
    firm_name: inv.firm.name,
    firm_id: inv.firm_id,
    category_id: inv.category_id,
    category_name: inv.category?.name ?? null,
    gl_account_id: inv.gl_account_id,
    gl_account_label: inv.glAccount ? `${inv.glAccount.account_code} — ${inv.glAccount.name}` : null,
    approval: inv.approval,
    lhdn_status: inv.lhdn_status,
    items: inv.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity.toString(),
      unit_price: item.unit_price.toString(),
      discount: item.discount.toString(),
      tax_type: item.tax_type,
      tax_rate: item.tax_rate.toString(),
      tax_amount: item.tax_amount.toString(),
      line_total: item.line_total.toString(),
      sort_order: item.sort_order,
    })),
    created_at: inv.created_at,
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
    // Detect if request is FormData (upload-originated SI/DN/OR) vs JSON (manual SI creation)
    const contentType = request.headers.get('content-type') || '';
    const isFormData = contentType.includes('multipart/form-data');

    if (isFormData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return handleFormDataUpload(request, session as any, firmIds);
    }

    const body = await request.json();

    const { firm_id, supplier_id, invoice_number, issue_date, due_date, currency, notes, items, category_id, gl_account_id, contra_gl_account_id } = body;

    if (!firm_id || !supplier_id || !invoice_number || !issue_date || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { data: null, error: 'Missing required fields: firm_id, supplier_id, invoice_number, issue_date, items[]' },
        { status: 400 }
      );
    }

    // Validate accountant has access to this firm
    if (firmIds && !firmIds.includes(firm_id)) {
      return NextResponse.json(
        { data: null, error: 'You do not have access to this firm' },
        { status: 403 }
      );
    }

    // Verify buyer belongs to this firm
    const buyer = await prisma.supplier.findUnique({
      where: { id: supplier_id },
      select: { firm_id: true },
    });
    if (!buyer || buyer.firm_id !== firm_id) {
      return NextResponse.json(
        { data: null, error: 'Buyer not found in this firm' },
        { status: 404 }
      );
    }

    // ── Duplicate check ──
    // 1. Invoice number match
    if (invoice_number) {
      const stripped = invoice_number.replace(/^[#\s]+/, '').trim();
      const existing = await prisma.salesInvoice.findFirst({
        where: {
          firm_id,
          OR: [
            { invoice_number: { equals: invoice_number, mode: 'insensitive' } },
            { invoice_number: { equals: stripped, mode: 'insensitive' } },
            { invoice_number: { equals: `#${stripped}`, mode: 'insensitive' } },
          ],
        },
        select: { id: true, invoice_number: true, buyer: { select: { name: true } } },
      });
      if (existing) {
        return NextResponse.json(
          { data: null, error: `Duplicate: sales invoice #${existing.invoice_number} already exists (${existing.buyer?.name})` },
          { status: 409 }
        );
      }
    }

    // Calculate totals from items
    let subtotal = 0;
    let taxAmount = 0;
    for (const item of items) {
      subtotal += parseFloat(item.line_total) || 0;
      taxAmount += parseFloat(item.tax_amount) || 0;
    }
    const totalAmount = subtotal + taxAmount;

    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        firm_id,
        supplier_id,
        invoice_number,
        issue_date: new Date(issue_date),
        due_date: due_date ? new Date(due_date) : null,
        currency: currency || 'MYR',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        payment_status: 'unpaid',
        amount_paid: 0,
        notes: notes || null,
        category_id: category_id || null,
        gl_account_id: gl_account_id || null,
        approval: 'approved',
        items: {
          create: items.map((item: { description: string; quantity: number; unit_price: number; discount?: number; tax_type?: string; tax_rate?: number; tax_amount?: number; line_total: number; sort_order?: number }, idx: number) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount || 0,
            tax_type: item.tax_type || null,
            tax_rate: item.tax_rate || 0,
            tax_amount: item.tax_amount || 0,
            line_total: item.line_total,
            sort_order: item.sort_order ?? idx,
          })),
        },
      },
      include: {
        buyer: { select: { id: true, name: true } },
        firm: { select: { name: true } },
        items: { orderBy: { sort_order: 'asc' } },
      },
    });

    const data = {
      id: salesInvoice.id,
      invoice_number: salesInvoice.invoice_number,
      issue_date: salesInvoice.issue_date,
      due_date: salesInvoice.due_date,
      currency: salesInvoice.currency,
      subtotal: salesInvoice.subtotal.toString(),
      tax_amount: salesInvoice.tax_amount.toString(),
      total_amount: salesInvoice.total_amount.toString(),
      amount_paid: salesInvoice.amount_paid.toString(),
      payment_status: salesInvoice.payment_status,
      notes: salesInvoice.notes,
      supplier_id: salesInvoice.supplier_id,
      buyer_name: salesInvoice.buyer.name,
      firm_name: salesInvoice.firm.name,
      firm_id: salesInvoice.firm_id,
      items: salesInvoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity.toString(),
        unit_price: item.unit_price.toString(),
        discount: item.discount.toString(),
        tax_type: item.tax_type,
        tax_rate: item.tax_rate.toString(),
        tax_amount: item.tax_amount.toString(),
        line_total: item.line_total.toString(),
        sort_order: item.sort_order,
      })),
      created_at: salesInvoice.created_at,
    };

    await auditLog({
      firmId: firm_id,
      tableName: 'SalesInvoice',
      recordId: salesInvoice.id,
      action: 'create',
      newValues: { invoice_number, total_amount: totalAmount, supplier_id },
      userId: session.user.id,
      userName: session.user.name,
    });

    // Accountant-created = auto-approved → create JV if GL accounts provided
    if (gl_account_id && contra_gl_account_id) {
      try {
        await findOpenPeriod(prisma, firm_id, new Date(issue_date));
        await createJournalEntry({
          firmId: firm_id,
          postingDate: new Date(issue_date),
          description: `Sales — ${salesInvoice.buyer.name} — ${invoice_number}`,
          sourceType: 'sales_invoice_posting',
          sourceId: salesInvoice.id,
          lines: [
            { glAccountId: contra_gl_account_id, debitAmount: totalAmount, creditAmount: 0, description: 'Trade Receivables' },
            { glAccountId: gl_account_id, debitAmount: 0, creditAmount: totalAmount, description: salesInvoice.buyer.name },
          ],
          createdBy: session.user.id,
        });
      } catch (jvErr) {
        console.error('JV creation warning for sales invoice:', jvErr);
        // Don't fail the invoice creation, just log
      }
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Error creating sales invoice:', error);
    return NextResponse.json(
      { data: null, error: 'Failed to create sales invoice' },
      { status: 500 }
    );
  }
}

/**
 * Handle FormData uploads for SI/DN/OR — documents uploaded via OCR flow.
 * Creates a SalesInvoice with a single auto-generated line item from the OCR total.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFormDataUpload(
  request: NextRequest,
  session: any,
  firmIds: string[] | null
) {
  try {
    const formData = await request.formData();
    const firmId = formData.get('firm_id') as string | null;
    const vendorName = formData.get('vendor_name') as string | null;
    const supplierIdParam = formData.get('supplier_id') as string | null;
    const invoiceNumber = formData.get('invoice_number') as string | null;
    const issueDate = formData.get('issue_date') as string | null;
    const dueDate = formData.get('due_date') as string | null;
    const totalAmountStr = formData.get('total_amount') as string | null;
    const notes = formData.get('notes') as string | null;
    const docSubtype = formData.get('doc_subtype') as string | null;
    const categoryId = formData.get('category_id') as string | null;
    const file = formData.get('file') as File | null;
    const isBatch = formData.get('batch') === 'true';

    if (!firmId || !vendorName || !issueDate || !totalAmountStr) {
      return NextResponse.json({ data: null, error: 'Missing required fields' }, { status: 400 });
    }

    if (firmIds && !firmIds.includes(firmId)) {
      return NextResponse.json({ data: null, error: 'No access to this firm' }, { status: 403 });
    }

    const totalAmount = parseFloat(totalAmountStr);

    // Resolve supplier (buyer/customer) — same logic as invoice upload
    let supplierId = supplierIdParam || null;
    if (!supplierId && vendorName) {
      const resolved = await resolveSupplier(vendorName, firmId);
      supplierId = resolved.supplierId;
    }
    if (!supplierId) {
      // Create new supplier for this buyer
      const newSupplier = await prisma.supplier.create({
        data: { firm_id: firmId, name: vendorName },
      });
      supplierId = newSupplier.id;
    }

    // Upload file to Google Drive
    let fileUrl: string | null = null;
    let fileDownloadUrl: string | null = null;
    if (file) {
      try {
        const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
        const uploaded = await uploadFileForFirm(file, firmId, firm.name, 'invoices');
        fileUrl = uploaded.fileUrl;
        fileDownloadUrl = uploaded.downloadUrl;
      } catch (err) {
        console.warn('Google Drive upload failed, creating sales invoice without file URLs:', err);
      }
    }

    // Get uploader employee — use first employee in the firm
    const uploaderEmployee = await prisma.employee.findFirst({
      where: { firm_id: firmId },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });

    // Auto-generate invoice number if not provided
    let resolvedInvoiceNumber = invoiceNumber || '';
    if (!resolvedInvoiceNumber) {
      const prefix = docSubtype === 'debit_note' ? 'DN' : 'SI';
      const count = await prisma.salesInvoice.count({ where: { firm_id: firmId, invoice_number: { startsWith: `${prefix}-` } } });
      resolvedInvoiceNumber = `${prefix}-${String(count + 1).padStart(3, '0')}`;
    }

    const salesInvoice = await prisma.salesInvoice.create({
      data: {
        firm_id: firmId,
        supplier_id: supplierId,
        created_by: uploaderEmployee?.id || null,
        invoice_number: resolvedInvoiceNumber,
        issue_date: new Date(issueDate),
        due_date: dueDate ? new Date(dueDate) : null,
        subtotal: totalAmount,
        tax_amount: 0,
        total_amount: totalAmount,
        payment_status: 'unpaid',
        amount_paid: 0,
        notes: notes || null,
        doc_subtype: docSubtype || null,
        category_id: categoryId || null,
        approval: isBatch ? 'pending_approval' : 'approved',
        file_url: fileUrl,
        file_download_url: fileDownloadUrl,
        items: {
          create: [{
            description: vendorName,
            quantity: 1,
            unit_price: totalAmount,
            discount: 0,
            tax_rate: 0,
            tax_amount: 0,
            line_total: totalAmount,
            sort_order: 0,
          }],
        },
      },
      include: {
        buyer: { select: { id: true, name: true } },
        firm: { select: { name: true } },
      },
    });

    await auditLog({
      firmId,
      tableName: 'SalesInvoice',
      recordId: salesInvoice.id,
      action: 'create',
      newValues: { invoice_number: resolvedInvoiceNumber, total_amount: totalAmount, supplier_id: supplierId, doc_subtype: docSubtype },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({
      data: {
        id: salesInvoice.id,
        invoice_number: salesInvoice.invoice_number,
        total_amount: salesInvoice.total_amount.toString(),
        buyer_name: salesInvoice.buyer.name,
      },
      error: null,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating sales invoice (FormData):', error);
    return NextResponse.json({ data: null, error: 'Failed to create sales invoice' }, { status: 500 });
  }
}
