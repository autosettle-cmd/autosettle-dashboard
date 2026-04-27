import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendVerificationCode } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, name, phone, password } = body;

  if (!token || !name || !phone || !password) {
    return NextResponse.json({ data: null, error: 'All fields are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ data: null, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Find user by invite token
  const user = await prisma.user.findUnique({ where: { invite_token: token } });
  if (!user) {
    return NextResponse.json({ data: null, error: 'Invalid or expired invitation' }, { status: 404 });
  }
  if (user.invite_token_expires && new Date() > user.invite_token_expires) {
    return NextResponse.json({ data: null, error: 'This invitation has expired. Ask your team to send a new one.' }, { status: 400 });
  }
  if (user.status !== 'pending_onboarding') {
    return NextResponse.json({ data: null, error: 'This invitation has already been used' }, { status: 400 });
  }

  try {
    const passwordHash = await hash(password, 10);

    // Get first assigned firm for employee record
    const firstFirm = await prisma.accountantFirm.findFirst({
      where: { user_id: user.id },
      select: { firm_id: true },
    });
    const firmId = firstFirm?.firm_id;

    if (!firmId) {
      return NextResponse.json({ data: null, error: 'No firm assignment found for this invitation' }, { status: 400 });
    }

    // Check phone uniqueness
    const existingPhone = await prisma.employee.findUnique({ where: { phone } });
    if (existingPhone) {
      const linkedUser = await prisma.user.findFirst({
        where: { employee_id: existingPhone.id, status: { notIn: ['rejected', 'pending_onboarding'] } },
      });
      if (linkedUser) {
        return NextResponse.json({ data: null, error: 'An account with this phone number already exists' }, { status: 409 });
      }
      // Clean up orphaned employee
      await prisma.employee.delete({ where: { id: existingPhone.id } });
    }

    // Create employee + update user with password and details
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await hash(verificationCode, 10);

    const employee = await prisma.employee.create({
      data: { name, phone, email: user.email, firm_id: firmId },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        password_hash: passwordHash,
        employee_id: employee.id,
        invite_token: null,
        invite_token_expires: null,
        verification_code: codeHash,
        verification_expires: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send verification email
    try {
      await sendVerificationCode(user.email, verificationCode, name);
    } catch (emailErr) {
      console.error('[accept-invite] Failed to send verification email:', emailErr);
    }

    return NextResponse.json({
      data: { userId: user.id, message: 'Verification code sent to your email' },
      error: null,
    }, { status: 201 });
  } catch (err) {
    console.error('[accept-invite] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to accept invitation';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
