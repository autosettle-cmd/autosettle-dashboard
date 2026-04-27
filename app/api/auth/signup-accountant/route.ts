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
  const { name, email, phone, password, firmName, firmAddress } = body;

  // Validate required fields
  if (!name || !email || !phone || !password || !firmName) {
    return NextResponse.json({ data: null, error: 'Name, email, phone, password, and firm name are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ data: null, error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  // Check email — allow re-signup if rejected or still pending (failed verification)
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    if (existingEmail.status === 'rejected' || existingEmail.status === 'pending_onboarding') {
      // Clean up old signup so they can start fresh
      if (existingEmail.firm_id) {
        const firm = await prisma.firm.findUnique({ where: { id: existingEmail.firm_id }, select: { is_active: true } });
        if (firm && !firm.is_active) {
          // Inactive firm from a previous failed signup — delete everything
          await prisma.user.delete({ where: { id: existingEmail.id } });
          await prisma.employee.deleteMany({ where: { firm_id: existingEmail.firm_id } });
          await prisma.firm.delete({ where: { id: existingEmail.firm_id } });
        } else {
          await prisma.user.delete({ where: { id: existingEmail.id } });
        }
      } else {
        await prisma.user.delete({ where: { id: existingEmail.id } });
      }
    } else {
      return NextResponse.json({ data: null, error: 'An account with this email already exists' }, { status: 409 });
    }
  }

  // Check phone uniqueness — allow if linked to deleted/rejected/pending user
  const existingPhone = await prisma.employee.findUnique({ where: { phone } });
  if (existingPhone) {
    const linkedUser = await prisma.user.findFirst({
      where: { employee_id: existingPhone.id, status: { notIn: ['rejected', 'pending_onboarding'] } },
    });
    if (linkedUser) {
      return NextResponse.json({ data: null, error: 'An account with this phone number already exists' }, { status: 409 });
    }
    // Orphaned employee from failed/rejected signup — delete it
    await prisma.employee.delete({ where: { id: existingPhone.id } });
  }

  try {
    const passwordHash = await hash(password, 10);
    const code = generateCode();
    const codeHash = await hash(code, 10);

    // Create firm + employee + user in a single transaction
    const user = await prisma.$transaction(async (tx) => {
      // Create firm (inactive until email verified)
      const firm = await tx.firm.create({
        data: {
          name: firmName,
          address_line1: firmAddress || null,
          is_active: false,
        },
      });

      // Create employee record
      const employee = await tx.employee.create({
        data: { name, phone, email, firm_id: firm.id },
      });

      // Create user (pending until email verified)
      const newUser = await tx.user.create({
        data: {
          email,
          password_hash: passwordHash,
          name,
          role: 'accountant',
          status: 'pending_onboarding',
          is_active: false,
          firm_id: firm.id,
          employee_id: employee.id,
          verification_code: codeHash,
          verification_expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        },
      });

      return newUser;
    });

    // Send verification email (outside transaction — non-blocking)
    try {
      await sendVerificationCode(email, code, name);
    } catch (emailErr) {
      console.error('[signup-accountant] Failed to send verification email:', emailErr);
      // Don't fail the signup — user can resend
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
    console.error('[signup-accountant] Error:', err);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
