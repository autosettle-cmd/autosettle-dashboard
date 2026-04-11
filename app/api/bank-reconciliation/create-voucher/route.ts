import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { validateBankReconJV, createBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionId, supplier_id, category_id, reference, notes } = await request.json();
  if (!bankTransactionId || !category_id) {
    return NextResponse.json({ data: null, error: 'bankTransactionId and category_id are required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || (firmIds && !firmIds.includes(txn.bankStatement.firm_id))) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }
  if (txn.recon_status !== 'unmatched') {
    return NextResponse.json({ data: null, error: 'Transaction is already matched or excluded' }, { status: 400 });
  }
  if (!txn.credit) {
    return NextResponse.json({ data: null, error: 'Payment voucher creation is only available for credit (incoming) transactions' }, { status: 400 });
  }

  const firmId = txn.bankStatement.firm_id;

  // Resolve supplier: use provided ID or default to "Walk-in Customer"
  let resolvedSupplierId = supplier_id;
  if (resolvedSupplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: resolvedSupplierId }, select: { firm_id: true } });
    if (!supplier || supplier.firm_id !== firmId) {
      return NextResponse.json({ data: null, error: 'Supplier not found in this firm' }, { status: 404 });
    }
  } else {
    let walkIn = await prisma.supplier.findFirst({ where: { firm_id: firmId, name: 'Walk-in Customer' } });
    if (!walkIn) {
      walkIn = await prisma.supplier.create({ data: { firm_id: firmId, name: 'Walk-in Customer', notes: 'Default account for ad-hoc customer payments' } });
    }
    resolvedSupplierId = walkIn.id;
  }

  const amount = Number(txn.credit);
  const merchant = txn.description.includes(' | ') ? txn.description.split(' | ')[0].trim() : txn.description.trim();

  // Find an employee in the firm to attribute the receipt to
  const employee = await prisma.employee.findFirst({ where: { firm_id: firmId } });
  if (!employee) {
    return NextResponse.json({ data: null, error: 'No employee found in the firm' }, { status: 400 });
  }

  // Create payment, receipt, link them, match bank txn — all atomically
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        firm_id: firmId,
        supplier_id: resolvedSupplierId,
        amount,
        payment_date: txn.transaction_date,
        reference: reference || null,
        notes: notes || null,
        direction: 'incoming',
      },
    });

    const claim = await tx.claim.create({
      data: {
        firm_id: firmId,
        employee_id: employee.id,
        type: 'receipt',
        claim_date: txn.transaction_date,
        merchant,
        amount,
        category_id,
        receipt_number: reference || null,
        description: notes || `Payment voucher — ${merchant}`,
        status: 'reviewed',
        approval: 'approved',
        payment_status: 'paid',
        confidence: 'HIGH',
        submitted_via: 'dashboard',
      },
    });

    await tx.paymentReceipt.create({
      data: { payment_id: payment.id, claim_id: claim.id },
    });

    await tx.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        matched_payment_id: payment.id,
        recon_status: 'manually_matched',
        matched_at: new Date(),
        matched_by: session.user.id,
      },
    });

    return { payment_id: payment.id, claim_id: claim.id };
  });

  // Validate + create JV (outside transaction since it uses its own)
  const validationError = await validateBankReconJV(bankTransactionId, result.payment_id, firmId);
  if (validationError) {
    return NextResponse.json({
      data: { ...result, recon_status: 'manually_matched', jv_warning: validationError },
      error: null,
    });
  }
  await createBankReconJV(bankTransactionId, result.payment_id, firmId, session.user.id);

  return NextResponse.json({
    data: { ...result, recon_status: 'manually_matched' },
    error: null,
  });
}
