"use client";

import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { MobileSidebarProvider } from "@/contexts/MobileSidebarContext";

export default function RoleLayout({
  role,
  children,
}: {
  role: "admin" | "accountant" | "employee";
  children: React.ReactNode;
}) {
  return (
    <MobileSidebarProvider>
      <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
        {/* Desktop sidebar */}
        <div className="hidden md:block flex-shrink-0">
          <Sidebar role={role} />
        </div>
        {/* Mobile sidebar (drawer) */}
        <div className="md:hidden">
          <Sidebar role={role} mobile />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile header with hamburger */}
          <div className="md:hidden">
            <MobileHeader />
          </div>
          {children}
        </div>
      </div>
    </MobileSidebarProvider>
  );
}
