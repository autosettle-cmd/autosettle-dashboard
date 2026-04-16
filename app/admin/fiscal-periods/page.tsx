'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
}

interface FiscalYear {
  id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  periods: Period[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function formatPeriodLabel(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_BADGE: Record<string, { class: string; label: string }> = {
  open:   { class: 'badge-green', label: 'Open' },
  closed: { class: 'badge-amber', label: 'Closed' },
  locked: { class: 'badge-gray',  label: 'Locked' },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminFiscalPeriodsPage() {
  usePageTitle('Fiscal Periods');
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFY, setExpandedFY] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/admin/fiscal-years')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          const data = j.data ?? [];
          setFiscalYears(data);
          if (data.length > 0) setExpandedFY(new Set([data[0].id]));
          setLoading(false);
        }
      })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const toggleExpandFY = (id: string) => {
    setExpandedFY((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Fiscal Periods</h1>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture animate-in">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : fiscalYears.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Fiscal Years</h3>
              <p className="text-sm text-[var(--text-secondary)]">Your accountant has not set up fiscal periods yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fiscalYears.map((fy) => {
                const isExpanded = expandedFY.has(fy.id);
                return (
                  <div key={fy.id} className="bg-white overflow-hidden">
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--surface-low)] transition-colors"
                      onClick={() => toggleExpandFY(fy.id)}
                    >
                      <div className="flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div>
                          <span className="font-semibold text-[var(--text-primary)] text-[15px]">{fy.year_label}</span>
                          <span className="ml-3 text-sm text-[var(--text-secondary)] tabular-nums">{formatDate(fy.start_date)} \u2014 {formatDate(fy.end_date)}</span>
                        </div>
                      </div>
                      <span className={STATUS_BADGE[fy.status].class}>{STATUS_BADGE[fy.status].label}</span>
                    </div>

                    {isExpanded && (
                      <div>
                        <table className="w-full">
                          <thead>
                            <tr className="bg-[var(--surface-header)] text-left">
                              <th className="px-5 py-2.5 w-16 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">#</th>
                              <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Period</th>
                              <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Start Date</th>
                              <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">End Date</th>
                              <th className="px-3 py-2.5 w-[100px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fy.periods.map((p, idx) => (
                              <tr key={p.id} className={`text-body-sm hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                                <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{p.period_number}</td>
                                <td className="px-3 py-3 text-[var(--text-primary)] font-medium">{formatPeriodLabel(p.start_date)}</td>
                                <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(p.start_date)}</td>
                                <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(p.end_date)}</td>
                                <td className="px-3 py-3">
                                  <span className={STATUS_BADGE[p.status].class}>{STATUS_BADGE[p.status].label}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
