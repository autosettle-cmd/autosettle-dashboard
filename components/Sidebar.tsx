'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { brand } from '@/config/branding';
import { useFirm } from '@/contexts/FirmContext';
import GlobalSearch from '@/components/GlobalSearch';

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
  const [showSearch, setShowSearch] = useState(false);

  // Listen for highlight-firm-selector events from other pages
  useEffect(() => {
    const handler = () => {
      setFirmHighlight(true);
      setTimeout(() => setFirmHighlight(false), 3000);
    };
    window.addEventListener('highlight-firm-selector', handler);
    return () => window.removeEventListener('highlight-firm-selector', handler);
  }, []);

  // Listen for open-global-search events from page headers
  useEffect(() => {
    const handler = () => setShowSearch(true);
    window.addEventListener('open-global-search', handler);
    return () => window.removeEventListener('open-global-search', handler);
  }, []);

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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

  return (<>
    <aside
      className="w-52 flex-shrink-0 flex flex-col bg-[#234B6E] relative"
      style={{
        /* Slab sitting ON TOP — casts shadow right onto the milled well */
        boxShadow: '10px 0 20px -5px rgba(0,0,0,0.15), 4px 0 8px -2px rgba(0,0,0,0.1)',
        /* Leading edge highlight — slab corner catching overhead light */
        borderRight: '1px solid rgba(255,255,255,0.15)',
        zIndex: 10,
      }}
    >
      {/* Logo + Brand */}
      <div className="px-5 h-16 flex-shrink-0 flex items-center gap-3 border-b border-white/10">
        <img
          src={brand.sidebarLogo}
          alt={brand.logoAlt}
          className="w-10 h-10 object-contain flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <span className="text-white font-bold text-[15px] leading-tight block">{brand.name}</span>
          <span className="text-[10px] text-white/50 tracking-tight block truncate">{firmName ?? ROLE_LABELS[role]}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
        {nav.map((item) => {
          if ('children' in item) {
            const isOpen = openDropdown === item.label;
            const hasActiveChild = item.children.some((c) => isChildActive(c.href));
            const totalPending = item.children.reduce((sum, c) => sum + (c.countKey ? (counts[c.countKey] ?? 0) : 0), 0);
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() => setOpenDropdown(isOpen ? null : item.label)}
                  className={`relative w-full flex items-center gap-3 px-3 py-1.5 text-xs tracking-tight transition-all btn-thick-sidebar ${
                    hasActiveChild ? 'btn-thick-sidebar-active' : ''
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  <span className="flex-1 text-left">{item.label}</span>
                  {!isOpen && totalPending > 0 && (
                    <span className="sidebar-badge">{totalPending}</span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-200 opacity-60 ${isOpen ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.children.map((child) => {
                      const active = isActive(child.href);
                      return (
                        <div key={child.href} className="flex items-center gap-1">
                          {/* Arrow */}
                          <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0 opacity-40">
                            <path d="M2 1 L2 5 L8 5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 3 L8 5 L6 7" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <Link
                            href={child.href}
                            className={`relative flex-1 flex items-center py-1 px-2.5 text-[11px] tracking-tight transition-all btn-thick-sidebar ${
                              active ? 'btn-thick-sidebar-active' : ''
                            }`}
                          >
                            {child.label}
                            {child.countKey && counts[child.countKey] > 0 && (
                              <span className="sidebar-badge">{counts[child.countKey]}</span>
                            )}
                          </Link>
                        </div>
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
              className={`relative flex items-center gap-3 px-3 py-1.5 text-xs tracking-tight transition-all btn-thick-sidebar ${
                active ? 'btn-thick-sidebar-active' : ''
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
              <span className="flex-1">{label}</span>
              {badgeCount > 0 && (
                <span className="sidebar-badge">{badgeCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section — user info, firm selector, sign out */}
      <div className="px-3 mt-auto pb-4">
        <div className="pt-3 border-t border-white/10 space-y-2">
          {/* Firm selector for multi-firm accountants */}
          {role === 'accountant' && firms.length > 1 && (
            <div className={`transition-all duration-300 ${firmHighlight ? 'animate-pulse' : ''}`}>
              <select
                value={firmId}
                onChange={(e) => setFirmId(e.target.value)}
                className={`w-full text-[12px] font-bold uppercase tracking-wider px-4 py-2.5 text-white focus:outline-none appearance-none cursor-pointer transition-all duration-300 ${
                  firmHighlight
                    ? 'bg-red-500 border-2 border-red-400 ring-2 ring-red-400/50'
                    : 'btn-thick-sidebar !bg-[#1A3D5C] !border-b-[#122D45] !border-r-[#122D45]'
                }`}
              >
                <option value="" className="text-[#191C1E] bg-white">All Firms</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id} className="text-[#191C1E] bg-white">{f.name}</option>
                ))}
              </select>
              {firmHighlight && (
                <p className="text-[10px] text-red-300 mt-1 text-center font-bold uppercase tracking-wider">Select a firm first</p>
              )}
            </div>
          )}
          {/* User info — milled into sidebar surface */}
          <div className="mx-3 my-2 px-3 py-2.5"
            style={{
              background: 'rgba(0,0,0,0.15)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.25), inset 0 1px 1px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.07)',
              borderTop: '1px solid rgba(0,0,0,0.2)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <p className="text-sm font-bold text-white truncate" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{session?.user?.name ?? '—'}</p>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold" style={{ textShadow: '0 1px 1px rgba(0,0,0,0.3)' }}>{session?.user?.role ?? role}</p>
          </div>
          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 font-medium hover:text-white hover:bg-white/10 transition-all tracking-tight"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>

      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} role={role} firmId={firmId} />
  </>);
}

export default function Sidebar({ role }: { role: 'admin' | 'accountant' | 'employee' }) {
  return (
    <Suspense>
      <SidebarInner role={role} />
    </Suspense>
  );
}
