import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, isAccountantOwner } from '@/lib/accountant-firms';

export const dynamic = 'force-dynamic';

// Update firm assignments for a team member
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const isOwner = await isAccountantOwner(session.user.id);
    if (!isOwner) {
      return NextResponse.json({ data: null, error: 'Only firm owners can manage team' }, { status: 403 });
    }

    const { id: memberId } = await params;
    const body = await request.json();
    const { firmIds: newFirmIds } = body as { firmIds: string[] };

    if (!newFirmIds || newFirmIds.length === 0) {
      return NextResponse.json({ data: null, error: 'At least one firm is required' }, { status: 400 });
    }

    // Validate target is a member (not owner)
    const memberRecords = await prisma.accountantFirm.findMany({
      where: { user_id: memberId },
    });
    if (memberRecords.some((r) => r.role === 'owner')) {
      return NextResponse.json({ data: null, error: 'Cannot modify owner assignments' }, { status: 403 });
    }

    // Validate all newFirmIds are in owner's set
    const ownerFirmIds = await getAccountantFirmIds(session.user.id);
    if (ownerFirmIds) {
      const invalid = newFirmIds.filter((id) => !ownerFirmIds.includes(id));
      if (invalid.length > 0) {
        return NextResponse.json({ data: null, error: 'Cannot assign firms you do not manage' }, { status: 403 });
      }
    }

    await prisma.$transaction([
      prisma.accountantFirm.deleteMany({ where: { user_id: memberId } }),
      prisma.accountantFirm.createMany({
        data: newFirmIds.map((firmId) => ({
          user_id: memberId,
          firm_id: firmId,
          role: 'member' as const,
        })),
      }),
    ]);

    return NextResponse.json({ data: { updated: true }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Remove a team member
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'accountant') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const isOwner = await isAccountantOwner(session.user.id);
    if (!isOwner) {
      return NextResponse.json({ data: null, error: 'Only firm owners can manage team' }, { status: 403 });
    }

    const { id: memberId } = await params;

    // Validate target is a member (not owner)
    const memberRecords = await prisma.accountantFirm.findMany({
      where: { user_id: memberId },
    });
    if (memberRecords.some((r) => r.role === 'owner')) {
      return NextResponse.json({ data: null, error: 'Cannot remove the firm owner' }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.accountantFirm.deleteMany({ where: { user_id: memberId } }),
      prisma.user.update({
        where: { id: memberId },
        data: { status: 'inactive', is_active: false },
      }),
    ]);

    return NextResponse.json({ data: { removed: true }, error: null });
  } catch (err) {
    console.error('[API Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
