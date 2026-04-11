'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { brand } from '@/config/branding';
import { useFirm } from '@/contexts/FirmContext';

// ─── Nav configs per role ────────────────────────────────────────────────────

const ADMIN_NAV = [
  { label: 'Dashboard',       href: '/admin/dashboard',            icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    children: [
      { label: 'Expense Claims', href: '/admin/claims?type=claim', countKey: 'claimPending' },
      { label: 'Mileage',        href: '/admin/claims?type=mileage', countKey: 'mileagePending' },
    ],
  },
  { label: 'Receipts',        href: '/admin/claims?type=receipt',  icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', countKey: 'receiptPending' },
  { label: 'Invoices', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    children: [
      { label: 'Received',  href: '/admin/invoices?tab=received', countKey: 'receivedPending' },
      { label: 'Issued',    href: '/admin/invoices?tab=issued', countKey: 'issuedPending' },
    ],
  },
  { label: 'Suppliers',       href: '/admin/suppliers',            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Bank Recon',      href: '/admin/bank-reconciliation',  icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: 'Employees',       href: '/admin/employees',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197', countKey: 'employeesPending' },
  { label: 'Categories',      href: '/admin/categories',           icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { label: 'Chart of Accounts', href: '/admin/chart-of-accounts', icon: 'M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
  { label: 'Fiscal Periods',    href: '/admin/fiscal-periods',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Tax Codes',          href: '/admin/tax-codes',          icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { label: 'Audit Log',         href: '/admin/audit-log',         icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
];

const ACCOUNTANT_NAV = [
  { label: 'Dashboard',       href: '/accountant/dashboard',            icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    children: [
      { label: 'Expense Claims', href: '/accountant/claims?type=claim', countKey: 'claimPending' },
      { label: 'Mileage',        href: '/accountant/claims?type=mileage', countKey: 'mileagePending' },
    ],
  },
  { label: 'Receipts',        href: '/accountant/claims?type=receipt',  icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', countKey: 'receiptPending' },
  { label: 'Invoices', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    children: [
      { label: 'Received',  href: '/accountant/invoices?tab=received', countKey: 'receivedPending' },
      { label: 'Issued',    href: '/accountant/invoices?tab=issued', countKey: 'issuedPending' },
    ],
  },
  { label: 'Suppliers',       href: '/accountant/suppliers',            icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Bank Recon',      href: '/accountant/bank-reconciliation',  icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: 'Clients',         href: '/accountant/clients',              icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',       href: '/accountant/employees',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197', countKey: 'employeesPending' },
  { label: 'Categories',      href: '/accountant/categories',           icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { label: 'Accounting', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    children: [
      { label: 'Journal Entries', href: '/accountant/journal-entries' },
      { label: 'General Ledger',  href: '/accountant/general-ledger' },
      { label: 'Trial Balance',   href: '/accountant/trial-balance' },
      { label: 'Profit & Loss',   href: '/accountant/profit-loss' },
      { label: 'Balance Sheet',   href: '/accountant/balance-sheet' },
      { label: 'Fiscal Periods',  href: '/accountant/fiscal-periods' },
      { label: 'Audit Log',       href: '/accountant/audit-log' },
      { label: 'Chart of Accounts', href: '/accountant/chart-of-accounts' },
    ],
  },
];

const EMPLOYEE_NAV = [
  { label: 'Dashboard',  href: '/employee/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'My Claims',  href: '/employee/claims',    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

type NavChild = { label: string; href: string; countKey?: string };
type NavItem = { label: string; href: string; icon: string; countKey?: string } | { label: string; icon: string; children: NavChild[] };

const NAV_MAP: Record<string, NavItem[]> = {
  admin: ADMIN_NAV,
  accountant: ACCOUNTANT_NAV,
  employee: EMPLOYEE_NAV,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  employee: 'Employee',
};

// ─── Sidebar Component ───────────────────────────────────────────────────────

function SidebarInner({ role }: { role: 'admin' | 'accountant' | 'employee' }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handleLogout = useLogout();
  const nav = NAV_MAP[role] ?? [];
  const { firms, firmId, setFirmId } = useFirm();
  const [firmName, setFirmName] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [firmHighlight, setFirmHighlight] = useState(false);

  // Listen for highlight-firm-selector events from other pages
  useEffect(() => {
    const handler = () => {
      setFirmHighlight(true);
      setTimeout(() => setFirmHighlight(false), 3000);
    };
    window.addEventListener('highlight-firm-selector', handler);
    return () => window.removeEventListener('highlight-firm-selector', handler);
  }, []);

  // Check if an href (possibly with query params) matches the current URL
  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    if (query) {
      if (pathname !== path) return false;
      const params = new URLSearchParams(query);
      let match = true;
      params.forEach((v, k) => { if (searchParams.get(k) !== v) match = false; });
      return match;
    }
    return pathname === path || (path !== `/${role}/dashboard` && pathname.startsWith(path));
  };

  const isChildActive = (href: string) => {
    const [path, query] = href.split('?');
    if (query) {
      if (pathname !== path) return false;
      const params = new URLSearchParams(query);
      let match = true;
      params.forEach((v, k) => { if (searchParams.get(k) !== v) match = false; });
      return match;
    }
    return pathname === path || pathname.startsWith(path);
  };

  // Auto-expand dropdown if current path is inside it
  useEffect(() => {
    for (const item of nav) {
      if ('children' in item && item.children.some((c) => isChildActive(c.href))) {
        setOpenDropdown(item.label);
        break;
      }
    }
  }, [pathname]);

  // Derive firm name from context for accountants, fetch for admin
  useEffect(() => {
    if (role === 'accountant') {
      if (firms.length === 1) setFirmName(firms[0].name);
      else if (firmId) setFirmName(firms.find(f => f.id === firmId)?.name ?? null);
      else setFirmName(null);
    } else if (role === 'admin') {
      fetch('/api/admin/firm')
        .then((r) => r.json())
        .then((j) => { if (j.data?.name) setFirmName(j.data.name); })
        .catch(() => {});
    }
  }, [role, firms, firmId]);

  // Fetch pending counts for sidebar badges (filtered by selected firm for accountants)
  useEffect(() => {
    if (role === 'employee') return;
    const prefix = role === 'admin' ? '/api/admin' : '/api';
    const firmParam = role === 'accountant' && firmId ? `?firmId=${firmId}` : '';
    Promise.all([
      fetch(`${prefix}/claims/counts${firmParam}`).then((r) => r.json()),
      fetch(`${prefix}/invoices/counts${firmParam}`).then((r) => r.json()),
      fetch(`/api/admin/employees/pending`).then((r) => r.json()),
    ]).then(([claimsRes, invoicesRes, employeesRes]) => {
      setCounts({
        claimPending: claimsRes.data?.claimPending ?? 0,
        receiptPending: claimsRes.data?.receiptPending ?? 0,
        mileagePending: claimsRes.data?.mileagePending ?? 0,
        receivedPending: invoicesRes.data?.receivedPending ?? 0,
        issuedPending: invoicesRes.data?.issuedPending ?? 0,
        employeesPending: employeesRes.meta?.count ?? 0,
      });
    }).catch(() => {});
  }, [role, firmId]);

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

      {/* Firm selector for multi-firm accountants */}
      {role === 'accountant' && firms.length > 1 && (
        <div className={`px-3 pt-3 transition-all duration-300 ${firmHighlight ? 'animate-pulse' : ''}`}>
          <select
            value={firmId}
            onChange={(e) => setFirmId(e.target.value)}
            className={`w-full text-[12px] px-2.5 py-1.5 rounded-lg text-white focus:outline-none appearance-none cursor-pointer transition-all duration-300 ${
              firmHighlight
                ? 'bg-red-500/30 border-2 border-red-400 ring-2 ring-red-400/50'
                : 'bg-white/10 border border-white/10 focus:border-white/30'
            }`}
          >
            <option value="" className="text-[#191C1E]">All Firms</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id} className="text-[#191C1E]">{f.name}</option>
            ))}
          </select>
          {firmHighlight && (
            <p className="text-[10px] text-red-300 mt-1 text-center font-medium">Select a firm first</p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          if ('children' in item) {
            const isOpen = openDropdown === item.label;
            const hasActiveChild = item.children.some((c) => isChildActive(c.href));
            const totalPending = item.children.reduce((sum, c) => sum + (c.countKey ? (counts[c.countKey] ?? 0) : 0), 0);
            return (
              <div key={item.label}>
                <button
                  onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                  className={`relative w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    hasActiveChild
                      ? 'text-white bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
                  }`}
                >
                  {hasActiveChild && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" style={{ backgroundColor: 'var(--primary)' }} />
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  <span className="flex-1 text-left">{item.label}</span>
                  {!isOpen && totalPending > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
                      {totalPending}
                    </span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-4 pl-4 border-l border-white/[0.06] space-y-0.5">
                    {item.children.map((child) => {
                      const active = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block h-8 flex items-center px-2.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                            active
                              ? 'text-white bg-white/[0.08]'
                              : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                          }`}
                        >
                          {child.label}
                          {child.countKey && counts[child.countKey] > 0 && (
                            <span className="ml-auto text-[10px] font-semibold bg-white/15 text-white/80 px-1.5 py-0.5 rounded-full tabular-nums">
                              {counts[child.countKey]}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const { label, href, icon, countKey } = item;
          const active = isActive(href);
          const badgeCount = countKey ? (counts[countKey] ?? 0) : 0;
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
              <span className="flex-1">{label}</span>
              {badgeCount > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
                  {badgeCount}
                </span>
              )}
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

export default function Sidebar({ role }: { role: 'admin' | 'accountant' | 'employee' }) {
  return (
    <Suspense>
      <SidebarInner role={role} />
    </Suspense>
  );
}
