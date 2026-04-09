import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const role = (token as any)?.role;

    const roleRedirects: Record<string, string> = {
      accountant: "/accountant/dashboard",
      admin: "/admin/dashboard",
      employee: "/employee/dashboard",
      platform_owner: "/platform/dashboard",
    };

    // Redirect authenticated users away from /login
    if (pathname === "/login" && token) {
      const destination = roleRedirects[role];
      if (destination) return NextResponse.redirect(new URL(destination, req.url));
    }

    // Enforce role-based access
    if (pathname.startsWith("/accountant") && role !== "accountant") {
      const destination = roleRedirects[role] ?? "/login";
      return NextResponse.redirect(new URL(destination, req.url));
    }

    if (pathname.startsWith("/admin") && role !== "admin") {
      const destination = roleRedirects[role] ?? "/login";
      return NextResponse.redirect(new URL(destination, req.url));
    }

    if (pathname.startsWith("/employee") && role !== "employee") {
      const destination = roleRedirects[role] ?? "/login";
      return NextResponse.redirect(new URL(destination, req.url));
    }

    if (pathname.startsWith("/platform") && role !== "platform_owner") {
      const destination = roleRedirects[role] ?? "/login";
      return NextResponse.redirect(new URL(destination, req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const { pathname } = req.nextUrl;
        // Allow unauthenticated access to /login and public routes
        if (pathname === "/login" || pathname === "/signup" || pathname === "/" || pathname.startsWith("/api/whatsapp")) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/accountant/:path*", "/admin/:path*", "/employee/:path*", "/platform/:path*", "/login"],
};
