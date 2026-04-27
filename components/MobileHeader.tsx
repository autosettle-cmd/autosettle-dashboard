"use client";

import { brand } from "@/config/branding";
import { useMobileSidebar } from "@/contexts/MobileSidebarContext";

export default function MobileHeader() {
  const { toggle } = useMobileSidebar();

  return (
    <header
      className="h-12 flex items-center px-4 bg-[#234B6E] flex-shrink-0"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      {/* Hamburger */}
      <button
        onClick={toggle}
        className="w-10 h-10 flex items-center justify-center -ml-2 text-white"
        aria-label="Toggle menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Logo + Brand */}
      <div className="flex items-center gap-2 flex-1 justify-center mr-10">
        <img
          src={brand.sidebarLogo}
          alt={brand.logoAlt}
          className="w-7 h-7 object-contain"
        />
        <span className="text-white font-bold text-sm">{brand.name}</span>
      </div>

      {/* Search */}
      <button
        onClick={() => window.dispatchEvent(new Event("open-global-search"))}
        className="w-10 h-10 flex items-center justify-center -mr-2 text-white/70"
        aria-label="Search"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </header>
  );
}
