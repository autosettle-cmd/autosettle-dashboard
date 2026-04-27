import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAccountantFirmIds, isAccountantOwner } from '@/lib/accountant-firms';
import { sendTeamInvite } from '@/lib/email';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'accountant') {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
  }

  const isOwner = await isAccountantOwner(session.user.id);
  if (!isOwner) {
    return NextResponse.json({ data: null, error: 'Only firm owners can invite team members' }, { status: 403 });
  }

  const body = await request.json();
  const { email, firmIds: selectedFirmIds } = body as { email: string; firmIds: string[] };

  if (!email || !selectedFirmIds?.length) {
    return NextResponse.json({ data: null, error: 'Email and at least one firm are required' }, { status: 400 });
  }

  // Validate selected firms are in owner's set
  const ownerFirmIds = await getAccountantFirmIds(session.user.id);
  if (ownerFirmIds) {
    const invalid = selectedFirmIds.filter((id) => !ownerFirmIds.includes(id));
    if (invalid.length > 0) {
      return NextResponse.json({ data: null, error: 'Cannot assign firms you do not manage' }, { status: 403 });
    }
  }

  // Check if email already has an active accountant
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === 'active' && existing.is_active) {
      return NextResponse.json({ data: null, error: 'An active account with this email already exists' }, { status: 409 });
    }
    // Clean up pending/rejected/inactive user so we can re-invite
    await prisma.accountantFirm.deleteMany({ where: { user_id: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  try {
    const token = crypto.randomUUID();

    // Create pending user with invite token (no password yet — set during accept)
    const user = await prisma.user.create({
      data: {
        email,
        password_hash: '', // placeholder — will be set during accept-invite
        name: email.split('@')[0], // placeholder name
        role: 'accountant',
        status: 'pending_onboarding',
        is_active: false,
        invite_token: token,
        invite_token_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        invited_by: session.user.id,
      },
    });

    // Create AccountantFirm records for selected firms
    await prisma.accountantFirm.createMany({
      data: selectedFirmIds.map((firmId) => ({
        user_id: user.id,
        firm_id: firmId,
        role: 'member' as const,
      })),
    });

    // Send invite email
    try {
      await sendTeamInvite(email, session.user.name ?? 'Your team', token);
    } catch (emailErr) {
      console.error('[team-invite] Failed to send invite email:', emailErr);
    }

    return NextResponse.json({
      data: { message: `Invitation sent to ${email}` },
      error: null,
    }, { status: 201 });
  } catch (err) {
    console.error('[team-invite] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send invitation';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
