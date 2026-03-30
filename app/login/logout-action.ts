"use server";

import { cookies } from "next/headers";

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("next-auth.session-token");
  cookieStore.delete("__Secure-next-auth.session-token");
  cookieStore.delete("next-auth.callback-url");
  cookieStore.delete("__Secure-next-auth.callback-url");
  cookieStore.delete("next-auth.csrf-token");
  cookieStore.delete("__Host-next-auth.csrf-token");
}
