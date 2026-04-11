import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateBankReconJV, createBankReconJV } from '@/lib/bank-recon-jv';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin' || !session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { bankTransactionId, supplier_id, category_id, reference, notes } = await request.json();
  if (!bankTransactionId || !category_id) {
    return NextResponse.json({ data: null, error: 'bankTransactionId and category_id are required' }, { status: 400 });
  }

  const txn = await prisma.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    include: { bankStatement: { select: { firm_id: true } } },
  });
  if (!txn || txn.bankStatement.firm_id !== session.user.firm_id) {
    return NextResponse.json({ data: null, error: 'Transaction not found' }, { status: 404 });
  }
  if (txn.recon_status !== 'unmatched') {
    return NextResponse.json({ data: null, error: 'Transaction is already matched' }, { status: 400 });
  }
  if (!txn.debit) {
    return NextResponse.json({ data: null, error: 'Official receipt creation is only available for debit (incoming) transactions' }, { status: 400 });
  }

  const firmId = session.user.firm_id;

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

  const amount = Number(txn.debit);
  const merchant = txn.description.includes(' | ') ? txn.description.split(' | ')[0].trim() : txn.description.trim();

  const employee = await prisma.employee.findFirst({ where: { firm_id: firmId } });
  if (!employee) {
    return NextResponse.json({ data: null, error: 'No employee found in the firm' }, { status: 400 });
  }

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
        description: notes || `Official receipt — ${merchant}`,
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
