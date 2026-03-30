"use server";

import { cookies } from "next/headers";

export async function logout() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  // Must match the exact same attributes used when setting the cookie
  const cookieOptions = {
    path: "/",
    secure: isProduction,
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 0,
  };

  // Delete both variants — only one will exist depending on environment
  cookieStore.set("next-auth.session-token", "", cookieOptions);
  cookieStore.set("__Secure-next-auth.session-token", "", cookieOptions);
  cookieStore.set("next-auth.callback-url", "", { ...cookieOptions, httpOnly: false });
  cookieStore.set("__Secure-next-auth.callback-url", "", { ...cookieOptions, httpOnly: false });
  cookieStore.set("next-auth.csrf-token", "", { ...cookieOptions, httpOnly: false });
  cookieStore.set("__Host-next-auth.csrf-token", "", { ...cookieOptions, httpOnly: false });
}
