'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { brand } from '@/config/branding';

// ─── Nav configs per role ────────────────────────────────────────────────────

const ADMIN_NAV = [
  { label: 'Dashboard',       href: '/admin/dashboard',            icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',          href: '/admin/claims',               icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',        href: '/admin/invoices',             icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',       href: '/admin/suppliers',            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Bank Recon',      href: '/admin/bank-reconciliation',  icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: 'Employees',       href: '/admin/employees',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories',      href: '/admin/categories',           icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

const ACCOUNTANT_NAV = [
  { label: 'Dashboard',       href: '/accountant/dashboard',            icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',          href: '/accountant/claims',               icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',        href: '/accountant/invoices',             icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',       href: '/accountant/suppliers',            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Bank Recon',      href: '/accountant/bank-reconciliation',  icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: 'Clients',         href: '/accountant/clients',              icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',       href: '/accountant/employees',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories',      href: '/accountant/categories',           icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

const EMPLOYEE_NAV = [
  { label: 'Dashboard',  href: '/employee/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'My Claims',  href: '/employee/claims',    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

const NAV_MAP = {
  admin: ADMIN_NAV,
  accountant: ACCOUNTANT_NAV,
  employee: EMPLOYEE_NAV,
} as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  employee: 'Employee',
};

// ─── Sidebar Component ───────────────────────────────────────────────────────

export default function Sidebar({ role }: { role: 'admin' | 'accountant' | 'employee' }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();
  const nav = NAV_MAP[role];
  const [firmName, setFirmName] = useState<string | null>(null);

  // Fetch firm name for subtitle (admin always, accountant only if single firm)
  useEffect(() => {
    if (role === 'accountant') {
      fetch('/api/firms')
        .then((r) => r.json())
        .then((j) => {
          if (j.data?.length === 1) setFirmName(j.data[0].name);
        })
        .catch(() => {});
    } else if (role === 'admin') {
      fetch('/api/admin/firm')
        .then((r) => r.json())
        .then((j) => { if (j.data?.name) setFirmName(j.data.name); })
        .catch(() => {});
    }
  }, [role]);

  return (
    <aside className="w-[232px] flex-shrink-0 flex flex-col backdrop-blur-[12px]" style={{ backgroundColor: 'rgba(21, 28, 40, 0.85)' }}>
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/[0.06]">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-white font-bold text-[15px] tracking-tight block leading-tight">{brand.name}</span>
          <span className="text-white/25 text-[10px] font-medium tracking-wider uppercase block truncate">{firmName ?? ROLE_LABELS[role]}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ label, href, icon }) => {
          const active = pathname === href || (href !== `/${role}/dashboard` && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2.5 h-10 px-3 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                active
                  ? 'text-white bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
              )}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-inner"
            style={{ background: 'linear-gradient(135deg, rgba(var(--primary-rgb),0.4) 0%, rgba(var(--primary-rgb),0.2) 100%)', border: '1px solid rgba(var(--primary-rgb),0.3)' }}
          >
            {(session?.user?.name ?? '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold truncate">{session?.user?.name ?? '—'}</p>
            <p className="text-white/30 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="mt-3 w-full flex items-center gap-2 text-[11px] text-white/35 hover:text-white/70 py-2 px-2.5 rounded-lg border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03] transition-all duration-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
