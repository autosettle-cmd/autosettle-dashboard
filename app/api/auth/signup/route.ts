import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

  // Check email uniqueness
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ data: null, error: 'An account with this email already exists' }, { status: 409 });
  }

  // Check phone uniqueness in User table (via employee link)
  const existingPhoneUser = await prisma.user.findFirst({
    where: { employee: { phone } },
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
      // Create new employee
      employee = await prisma.employee.create({
        data: { name, phone, email, firm_id: firmId },
      });
    }

    // Create user
    const passwordHash = await hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        name,
        role: 'employee',
        status: 'pending_onboarding',
        firm_id: firmId,
        employee_id: employee.id,
      },
    });

    return NextResponse.json({
      data: { message: 'Account created successfully' },
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
