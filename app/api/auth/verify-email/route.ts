import { NextRequest, NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendVerificationCode } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, code, action } = body;

  if (!userId) {
    return NextResponse.json({ data: null, error: 'userId is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, status: true, firm_id: true,
      verification_code: true, verification_expires: true,
    },
  });

  if (!user) {
    return NextResponse.json({ data: null, error: 'User not found' }, { status: 404 });
  }

  // ─── Resend code ───────────────────────────────────────────────────────
  if (action === 'resend') {
    if (user.status !== 'pending_onboarding') {
      return NextResponse.json({ data: null, error: 'Account is already verified' }, { status: 400 });
    }

    // Rate limit: check if code was sent less than 60 seconds ago
    if (user.verification_expires) {
      const codeAge = Date.now() - (user.verification_expires.getTime() - 15 * 60 * 1000);
      if (codeAge < 60 * 1000) {
        return NextResponse.json({ data: null, error: 'Please wait before requesting a new code' }, { status: 429 });
      }
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await hash(newCode, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        verification_code: codeHash,
        verification_expires: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    try {
      await sendVerificationCode(user.email, newCode, user.name);
    } catch (emailErr) {
      console.error('[verify-email] Failed to resend:', emailErr);
    }

    return NextResponse.json({ data: { message: 'New code sent' }, error: null });
  }

  // ─── Verify code ───────────────────────────────────────────────────────
  if (!code) {
    return NextResponse.json({ data: null, error: 'Verification code is required' }, { status: 400 });
  }

  if (user.status !== 'pending_onboarding') {
    return NextResponse.json({ data: null, error: 'Account is already verified' }, { status: 400 });
  }

  if (!user.verification_code || !user.verification_expires) {
    return NextResponse.json({ data: null, error: 'No verification code found. Request a new one.' }, { status: 400 });
  }

  if (new Date() > user.verification_expires) {
    return NextResponse.json({ data: null, error: 'Verification code has expired. Request a new one.' }, { status: 400 });
  }

  const isValid = await compare(code, user.verification_code);
  if (!isValid) {
    return NextResponse.json({ data: null, error: 'Invalid verification code' }, { status: 400 });
  }

  // ─── Activate account ─────────────────────────────────────────────────
  try {
    await prisma.$transaction(async (tx) => {
      // Activate user
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'active',
          is_active: true,
          verification_code: null,
          verification_expires: null,
        },
      });

      // Activate firm
      if (user.firm_id) {
        await tx.firm.update({
          where: { id: user.firm_id },
          data: { is_active: true },
        });

        // Link accountant to firm
        await tx.accountantFirm.create({
          data: { user_id: user.id, firm_id: user.firm_id },
        });

        // COA, fiscal year, and firm details are set up by the accountant
        // via the onboarding setup wizard after first login
      }
    });
    }

    // TODO: Set up billing/trial period for firm

    return NextResponse.json({
      data: { message: 'Email verified! You can now log in.' },
      error: null,
    });
  } catch (err) {
    console.error('[verify-email] Activation error:', err);
    return NextResponse.json({ data: null, error: 'Failed to activate account' }, { status: 500 });
  }
}
