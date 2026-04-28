import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify firm is in accountant's assigned firms
  const firmIds = await getAccountantFirmIds(session.user.id);
  if (firmIds && !firmIds.includes(id)) {
    return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
  }

  const existing = await prisma.firm.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ data: null, error: 'Firm not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, registrationNumber, contactEmail, contactPhone, plan, is_active,
    tin, brn, msic_code, sst_registration_number,
    address_line1, address_line2, city, postal_code, state, country,
    lhdn_client_id, lhdn_client_secret,
    default_trade_payables_gl_id, default_staff_claims_gl_id, default_trade_receivables_gl_id, default_retained_earnings_gl_id } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (registrationNumber !== undefined) data.registration_number = registrationNumber;
  if (contactEmail !== undefined) data.contact_email = contactEmail || null;
  if (contactPhone !== undefined) data.contact_phone = contactPhone || null;
  if (plan !== undefined) data.plan = plan;
  if (typeof is_active === 'boolean') {
    // Block deactivation if firm has any data (invoices, claims, employees, suppliers)
    if (is_active === false) {
      const [invoiceCount, claimCount, employeeCount, supplierCount] = await Promise.all([
        prisma.invoice.count({ where: { firm_id: id } }),
        prisma.claim.count({ where: { firm_id: id } }),
        prisma.employee.count({ where: { firm_id: id } }),
        prisma.supplier.count({ where: { firm_id: id } }),
      ]);
      const hasData = invoiceCount > 0 || claimCount > 0 || employeeCount > 0 || supplierCount > 0;
      if (hasData) {
        const items: string[] = [];
        if (invoiceCount > 0) items.push(`${invoiceCount} invoice(s)`);
        if (claimCount > 0) items.push(`${claimCount} claim(s)`);
        if (employeeCount > 0) items.push(`${employeeCount} employee(s)`);
        if (supplierCount > 0) items.push(`${supplierCount} supplier(s)`);
        return NextResponse.json({
          data: null,
          error: `Cannot deactivate — firm has ${items.join(', ')}. Clear all data before deactivating.`,
        }, { status: 409 });
      }
    }
    data.is_active = is_active;
  }

  // LHDN fields
  if (tin !== undefined) data.tin = tin || null;
  if (brn !== undefined) data.brn = brn || null;
  if (msic_code !== undefined) data.msic_code = msic_code || null;
  if (sst_registration_number !== undefined) data.sst_registration_number = sst_registration_number || null;
  if (address_line1 !== undefined) data.address_line1 = address_line1 || null;
  if (address_line2 !== undefined) data.address_line2 = address_line2 || null;
  if (city !== undefined) data.city = city || null;
  if (postal_code !== undefined) data.postal_code = postal_code || null;
  if (state !== undefined) data.state = state || null;
  if (country !== undefined) data.country = country || null;
  if (lhdn_client_id !== undefined) data.lhdn_client_id = lhdn_client_id || null;
  if (lhdn_client_secret !== undefined) data.lhdn_client_secret = lhdn_client_secret || null;

  // GL defaults
  if (default_trade_payables_gl_id !== undefined) data.default_trade_payables_gl_id = default_trade_payables_gl_id || null;
  if (default_staff_claims_gl_id !== undefined) data.default_staff_claims_gl_id = default_staff_claims_gl_id || null;
  if (default_trade_receivables_gl_id !== undefined) data.default_trade_receivables_gl_id = default_trade_receivables_gl_id || null;
  if (default_retained_earnings_gl_id !== undefined) data.default_retained_earnings_gl_id = default_retained_earnings_gl_id || null;

  try {
    const updated = await prisma.firm.update({
      where: { id },
      data,
    });

    return NextResponse.json({ data: updated, error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update firm';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
