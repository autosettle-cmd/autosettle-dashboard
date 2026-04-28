import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) return null;
          if (user.status !== "active" || !user.is_active) return null;

          const passwordMatch = await compare(
            credentials.password,
            user.password_hash
          );

          if (!passwordMatch) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            firm_id: user.firm_id,
            employee_id: user.employee_id,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.firm_id = user.firm_id;
        token.employee_id = user.employee_id;
      }
      // Validate user still exists in DB (prevents stale sessions after DB reset)
      if (token.sub) {
        const { prisma: db } = await import('@/lib/prisma');
        const exists = await db.user.findUnique({ where: { id: token.sub }, select: { id: true } });
        if (!exists) return { ...token, invalidated: true };
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.invalidated) return { ...session, user: undefined as unknown as typeof session.user };
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role;
        session.user.firm_id = token.firm_id;
        session.user.employee_id = token.employee_id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
