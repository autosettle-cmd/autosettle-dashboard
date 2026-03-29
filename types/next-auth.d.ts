import { UserRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: UserRole;
    firm_id: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: UserRole;
      firm_id: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    firm_id: string | null;
  }
}
