import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { recalcInvoicePaid } from '@/lib/invoice-payment';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyAccess(session: any, firmId: string) {
  if (session.user.role === 'accountant') {
    const firmIds = await getAccountantFirmIds(session.user.id);
    if (firmIds && !firmIds.includes(firmId)) return false;
  } else if (session.user.role === 'admin') {
    if (session.user.firm_id !== firmId) return false;
  } else {
    return false;
  }
  return true;
}

// GET — list receipt links for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: invoiceId } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { firm_id: true },
  });
  if (!invoice || !(await verifyAccess(session, invoice.firm_id))) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  const links = await prisma.invoiceReceiptLink.findMany({
    where: { invoice_id: invoiceId },
    select: {
      id: true,
      amount: true,
      linked_at: true,
      claim: {
        select: {
          id: true, merchant: true, receipt_number: true, amount: true,
          claim_date: true, file_url: true, thumbnail_url: true,
          employee: { select: { name: true } },
        },
      },
    },
    orderBy: { linked_at: 'desc' },
  });

  return NextResponse.json({ data: links, error: null });
}

// POST — link a receipt to an invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: invoiceId } = await params;
  const { claimId, amount } = await request.json();

  if (!claimId) {
    return NextResponse.json({ data: null, error: 'claimId is required' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { firm_id: true, total_amount: true, amount_paid: true },
  });
  if (!invoice || !(await verifyAccess(session, invoice.firm_id))) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { id: true, firm_id: true, type: true, amount: true },
  });
  if (!claim || claim.firm_id !== invoice.firm_id) {
    return NextResponse.json({ data: null, error: 'Receipt not found in this firm' }, { status: 404 });
  }
  if (claim.type !== 'receipt') {
    return NextResponse.json({ data: null, error: 'Only receipt-type claims can be linked to invoices' }, { status: 400 });
  }

  // Check for existing link
  const existing = await prisma.invoiceReceiptLink.findUnique({
    where: { invoice_id_claim_id: { invoice_id: invoiceId, claim_id: claimId } },
  });
  if (existing) {
    return NextResponse.json({ data: null, error: 'This receipt is already linked to this invoice' }, { status: 409 });
  }

  // Determine link amount
  const invoiceBalance = Number(invoice.total_amount) - Number(invoice.amount_paid);
  const receiptTotal = Number(claim.amount);

  // Get receipt's unallocated amount
  const existingLinks = await prisma.invoiceReceiptLink.findMany({
    where: { claim_id: claimId },
    select: { amount: true },
  });
  const receiptAllocated = existingLinks.reduce((s, l) => s + Number(l.amount), 0);
  const receiptAvailable = receiptTotal - receiptAllocated;

  if (receiptAvailable <= 0) {
    return NextResponse.json({ data: null, error: 'This receipt is fully allocated' }, { status: 400 });
  }

  const linkAmount = amount ? Math.min(Number(amount), receiptAvailable, invoiceBalance) : Math.min(receiptAvailable, invoiceBalance);
  if (linkAmount <= 0) {
    return NextResponse.json({ data: null, error: 'Invoice is already fully paid' }, { status: 400 });
  }

  // Create link and update invoice
  await prisma.invoiceReceiptLink.create({
    data: {
      invoice_id: invoiceId,
      claim_id: claimId,
      amount: linkAmount,
      linked_by: session.user.id,
    },
  });

  await recalcInvoicePaid(invoiceId);

  return NextResponse.json({ data: { linked: true, amount: linkAmount }, error: null });
}

// DELETE — unlink a receipt from an invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== 'accountant' && session.user.role !== 'admin')) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: invoiceId } = await params;
  const { claimId } = await request.json();

  if (!claimId) {
    return NextResponse.json({ data: null, error: 'claimId is required' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { firm_id: true },
  });
  if (!invoice || !(await verifyAccess(session, invoice.firm_id))) {
    return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
  }

  // Check if invoice is bank-reconciled
  const bankMatch = await prisma.bankTransactionInvoice.findFirst({
    where: { invoice_id: invoiceId, bankTransaction: { recon_status: 'manually_matched' } },
    select: { id: true },
  });

  const link = await prisma.invoiceReceiptLink.findUnique({
    where: { invoice_id_claim_id: { invoice_id: invoiceId, claim_id: claimId } },
  });
  if (!link) {
    return NextResponse.json({ data: null, error: 'Link not found' }, { status: 404 });
  }

  await prisma.invoiceReceiptLink.delete({
    where: { id: link.id },
  });

  await recalcInvoicePaid(invoiceId);

  return NextResponse.json({
    data: { unlinked: true },
    warning: bankMatch ? 'This invoice has been bank-reconciled. Unlinking the receipt does not affect the journal entry.' : undefined,
    error: null,
  });
}
