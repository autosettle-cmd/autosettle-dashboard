import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds } from '@/lib/accountant-firms';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== 'accountant' && role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ data: null, error: 'invoiceId is required' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, firm_id: true, vendor_name_raw: true, invoice_number: true, total_amount: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json({ data: null, error: 'Invoice not found' }, { status: 404 });
    }

    // Access check
    if (role === 'accountant') {
      const firmIds = await getAccountantFirmIds(session.user.id);
      if (firmIds && !firmIds.includes(invoice.firm_id)) {
        return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
      }
    } else if (role === 'admin') {
      if (session.user.firm_id !== invoice.firm_id) {
        return NextResponse.json({ data: null, error: 'Not authorized for this firm' }, { status: 403 });
      }
    }

    await prisma.invoice.delete({ where: { id: invoiceId } });

    await auditLog({
      firmId: invoice.firm_id,
      tableName: 'Invoice',
      recordId: invoiceId,
      action: 'delete',
      oldValues: {
        vendor: invoice.vendor_name_raw,
        invoice_number: invoice.invoice_number,
        total_amount: Number(invoice.total_amount),
        status: invoice.status,
      },
      userId: session.user.id,
      userName: session.user.name,
    });

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json({ data: null, error: 'Failed to delete invoice' }, { status: 500 });
  }
}
