'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

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
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Fiscal Periods</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : fiscalYears.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Fiscal Years</h3>
              <p className="text-sm text-[#8E9196]">Your accountant has not set up fiscal periods yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fiscalYears.map((fy) => {
                const isExpanded = expandedFY.has(fy.id);
                return (
                  <div key={fy.id} className="bg-white rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#F2F4F6] transition-colors"
                      onClick={() => toggleExpandFY(fy.id)}
                    >
                      <div className="flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E9196" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div>
                          <span className="font-semibold text-[#191C1E] text-[15px]">{fy.year_label}</span>
                          <span className="ml-3 text-sm text-[#8E9196]">{formatDate(fy.start_date)} — {formatDate(fy.end_date)}</span>
                        </div>
                      </div>
                      <span className={STATUS_BADGE[fy.status].class}>{STATUS_BADGE[fy.status].label}</span>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <table className="w-full">
                          <thead>
                            <tr className="ds-table-header text-left">
                              <th className="px-5 py-2.5 w-16">#</th>
                              <th className="px-3 py-2.5">Period</th>
                              <th className="px-3 py-2.5">Start Date</th>
                              <th className="px-3 py-2.5">End Date</th>
                              <th className="px-3 py-2.5 w-[100px]">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fy.periods.map((p) => (
                              <tr key={p.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50">
                                <td className="px-5 py-3 text-[#8E9196] tabular-nums">{p.period_number}</td>
                                <td className="px-3 py-3 text-[#191C1E] font-medium">{formatPeriodLabel(p.start_date)}</td>
                                <td className="px-3 py-3 text-[#434654] tabular-nums">{formatDate(p.start_date)}</td>
                                <td className="px-3 py-3 text-[#434654] tabular-nums">{formatDate(p.end_date)}</td>
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
