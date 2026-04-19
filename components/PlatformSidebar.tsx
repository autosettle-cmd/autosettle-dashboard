'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLogout } from '@/lib/use-logout';
import { brand } from '@/config/branding';

const NAV = [
  { label: 'Dashboard', href: '/platform/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Firms',     href: '/platform/firms',     icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
];

export default function PlatformSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside
      className="w-52 flex-shrink-0 flex flex-col relative"
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F6F7F8 100%)',
        boxShadow: '10px 0 20px -5px rgba(0,0,0,0.08), 4px 0 8px -2px rgba(0,0,0,0.04)',
        borderRight: '1px solid #E0E3E5',
        zIndex: 10,
      }}
    >
      {/* Logo + Brand */}
      <div className="px-5 h-16 flex-shrink-0 flex items-center gap-3 border-b border-[#E0E3E5]">
        <img
          src={brand.sidebarLogo}
          alt={brand.logoAlt}
          className="w-10 h-10 object-contain flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <span className="text-[var(--text-primary)] font-bold text-[15px] leading-tight block">{brand.name}</span>
          <span className="text-[10px] text-[var(--text-secondary)] tracking-tight block">Platform</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold uppercase tracking-widest transition-all ${
                active
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-low)]'
              }`}
              style={active ? {
                background: 'linear-gradient(180deg, #2D5F8A 0%, #234B6E 100%)',
                boxShadow: '0 3px 0 0 #142F47, 1px 0 0 0 #1A3D5C, 0 4px 8px rgba(0,0,0,0.12), inset 1px 1px 0 0 rgba(255,255,255,0.15), inset -1px -1px 0 0 rgba(0,0,0,0.2)',
                borderTop: '1px solid rgba(255,255,255,0.25)',
                textShadow: '0 1px 1px rgba(0,0,0,0.3)',
              } : {
                boxShadow: '0 2px 0 0 #D0D3D8, 1px 0 0 0 #E0E3E5, inset 1px 1px 0 0 rgba(255,255,255,0.9), inset -1px -1px 0 0 rgba(0,0,0,0.04)',
                borderTop: '1px solid rgba(255,255,255,0.95)',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F2F3F5 100%)',
              }}
            >
              <svg className="w-[16px] h-[16px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#E0E3E5]">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-[var(--text-primary)] truncate">{session?.user?.name ?? 'Platform Owner'}</p>
          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest">Platform Owner</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-low)] transition-colors border-t border-[#E0E3E5]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
