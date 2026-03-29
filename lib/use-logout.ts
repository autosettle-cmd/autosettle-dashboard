"use client";

import { useCallback } from "react";
import { logout } from "@/app/login/logout-action";

export function useLogout() {
  return useCallback(async () => {
    await logout();
    window.location.href = "/login";
  }, []);
}
