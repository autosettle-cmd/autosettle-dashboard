"use server";

import { compare } from "bcryptjs";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function login(email: string, password: string) {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.is_active) return { error: "Invalid email or password." };

    const match = await compare(password, user.password_hash);
    if (!match) return { error: "Invalid email or password." };

    // Build the same JWT payload that NextAuth's jwt callback produces
    const token = await encode({
      token: {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        firm_id: user.firm_id,
        employee_id: user.employee_id,
      },
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: 30 * 24 * 60 * 60,
    });

    const cookieStore = await cookies();
    cookieStore.set("next-auth.session-token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60,
    });

    return { role: user.role };
  } catch (error) {
    console.error("Login error:", error);
    return { error: "Unable to sign in. Please try again." };
  }
}
