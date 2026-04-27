import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendVerificationCode } from '@/lib/email';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, password, firmId } = body;

  // Validate required fields
  if (!name || !email || !phone || !password || !firmId) {
    return NextResponse.json({ data: null, error: 'All fields are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ data: null, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Check email — allow re-signup if rejected or still pending (failed verification)
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    if (existingEmail.status === 'rejected' || existingEmail.status === 'pending_onboarding') {
      // Delete old signup so they can start fresh
      await prisma.user.delete({ where: { id: existingEmail.id } });
    } else {
      return NextResponse.json({ data: null, error: 'An account with this email already exists' }, { status: 409 });
    }
  }

  // Check phone uniqueness in User table (via employee link) — skip rejected/pending
  const existingPhoneUser = await prisma.user.findFirst({
    where: { employee: { phone }, status: { notIn: ['rejected', 'pending_onboarding'] } },
  });
  if (existingPhoneUser) {
    return NextResponse.json({ data: null, error: 'An account with this phone number already exists' }, { status: 409 });
  }

  // Verify firm exists and is active
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true, is_active: true } });
  if (!firm || !firm.is_active) {
    return NextResponse.json({ data: null, error: 'Invalid firm selected' }, { status: 400 });
  }

  try {
    // Check if employee with this phone already exists
    let employee = await prisma.employee.findUnique({ where: { phone } });

    if (!employee) {
      employee = await prisma.employee.create({
        data: { name, phone, email, firm_id: firmId },
      });
    }

    const passwordHash = await hash(password, 10);
    const code = generateCode();
    const codeHash = await hash(code, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        name,
        role: 'employee',
        status: 'pending_onboarding',
        is_active: false,
        firm_id: firmId,
        employee_id: employee.id,
        verification_code: codeHash,
        verification_expires: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    // Send verification email
    try {
      await sendVerificationCode(email, code, name);
    } catch (emailErr) {
      console.error('[signup] Failed to send verification email:', emailErr);
    }

    return NextResponse.json({
      data: { userId: user.id, message: 'Verification code sent to your email' },
      error: null,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Signup failed';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ data: null, error: 'An account with these details already exists' }, { status: 409 });
    }
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
