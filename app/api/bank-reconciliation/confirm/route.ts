import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { validateBankReconJV, createBankReconJV } from '@/lib/bank-recon-jv';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }
  const firmIds = await getAccountantFirmIds(session.user.id);

  const { bankTransactionIds } = await request.json();
  if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0) {
    return NextResponse.json({ data: null, error: 'bankTransactionIds required' }, { status: 400 });
  }

  // Load all transactions with their matched payments
  const txns = await prisma.bankTransaction.findMany({
    where: { id: { in: bankTransactionIds }, recon_status: 'matched' },
    include: { bankStatement: { select: { firm_id: true } } },
  });

  if (txns.length === 0) {
    return NextResponse.json({ data: null, error: 'No suggested matches found to confirm.' }, { status: 400 });
  }

  // Verify firm access
  for (const txn of txns) {
    if (firmIds && !firmIds.includes(txn.bankStatement.firm_id)) {
      return NextResponse.json({ data: null, error: 'Access denied' }, { status: 403 });
    }
  }

  // Validate ALL JV prerequisites before confirming any
  const errors: string[] = [];
  for (const txn of txns) {
    if (!txn.matched_payment_id) {
      errors.push(`Transaction ${txn.description} has no matched payment.`);
      continue;
    }
    const err = await validateBankReconJV(txn.id, txn.matched_payment_id, txn.bankStatement.firm_id);
    if (err) errors.push(err);
  }

  if (errors.length > 0) {
    const unique = Array.from(new Set(errors));
    return NextResponse.json({ data: null, error: unique.join('\n') }, { status: 400 });
  }

  // All validated — confirm and create JVs
  let confirmed = 0;
  for (const txn of txns) {
    await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: {
        recon_status: 'manually_matched',
        matched_at: new Date(),
        matched_by: session.user.id,
      },
    });

    await createBankReconJV(txn.id, txn.matched_payment_id!, txn.bankStatement.firm_id, session.user.id);
    confirmed++;
  }

  return NextResponse.json({ data: { confirmed }, error: null });
}
