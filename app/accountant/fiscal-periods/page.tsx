'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  fiscal_year_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
}

interface FiscalYear {
  id: string;
  firm_id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  periods: Period[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(iso: string) {
  const d = new Date(iso);
  return [
    d.getFullYear(),
    (d.getMonth() + 1).toString().padStart(2, '0'),
    d.getDate().toString().padStart(2, '0'),
  ].join('.');
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

export default function FiscalPeriodsPage() {
  usePageTitle('Fiscal Periods');
  const { firmId, firmsLoaded } = useFirm();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedFY, setExpandedFY] = useState<Set<string>>(new Set());

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [modalLabel, setModalLabel] = useState('');
  const [modalMonth, setModalMonth] = useState(0);
  const [modalYear, setModalYear] = useState(new Date().getFullYear());
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Edit modal
  const [editFY, setEditFY] = useState<FiscalYear | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = (fy: FiscalYear) => {
    setEditFY(fy);
    setEditLabel(fy.year_label);
    setEditStart(fy.start_date.split('T')[0]);
    setEditEnd(fy.end_date.split('T')[0]);
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editFY || !editLabel || !editStart || !editEnd) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/fiscal-years/${editFY.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year_label: editLabel, start_date: editStart, end_date: editEnd }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || 'Failed'); setEditSaving(false); return; }
      setEditFY(null);
      setRefreshKey(k => k + 1);
    } catch { setEditError('Network error'); }
    setEditSaving(false);
  };

  // Load fiscal years
  useEffect(() => {
    if (!firmsLoaded) return;
    if (!firmId) { setFiscalYears([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    fetch(`/api/fiscal-years?firmId=${firmId}`)
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
  }, [firmId, refreshKey, firmsLoaded]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const toggleExpandFY = (id: string) => {
    setExpandedFY((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  const toggleFYStatus = async (fy: FiscalYear) => {
    const newStatus = fy.status === 'open' ? 'closed' : 'open';
    try {
      const res = await fetch(`/api/fiscal-years/${fy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) refresh();
      else {
        const json = await res.json();
        alert(json.error || 'Failed to update');
      }
    } catch {
      alert('Network error');
    }
  };

  const changePeriodStatus = async (fyId: string, period: Period, newStatus: string) => {
    try {
      const res = await fetch(`/api/fiscal-years/${fyId}/periods/${period.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) refresh();
      else {
        const json = await res.json();
        alert(json.error || 'Failed to update');
      }
    } catch {
      alert('Network error');
    }
  };

  // ─── Create Modal ─────────────────────────────────────────────────────────

  const openCreateModal = () => {
    const now = new Date();
    setModalLabel(`FY${now.getFullYear()}`);
    setModalMonth(0);
    setModalYear(now.getFullYear());
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const submitCreate = async () => {
    if (!modalLabel.trim()) {
      setModalError('Label is required.');
      return;
    }
    setModalSaving(true);
    setModalError('');

    try {
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmId,
          yearLabel: modalLabel.trim(),
          startMonth: modalMonth,
          startYear: modalYear,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to create');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
    } catch {
      setModalError('Network error');
      setModalSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Fiscal Periods</h1>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture ledger-binding animate-in">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firmId && (
              <button onClick={openCreateModal} className="ml-auto btn-thick-navy text-sm px-4 py-2 font-semibold">
                Create Fiscal Year
              </button>
            )}
          </div>

          {!firmId ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Select a firm to manage fiscal periods.</div>
          ) : loading ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : fiscalYears.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Fiscal Years</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-6">Create your first fiscal year to define accounting periods.</p>
              <button onClick={openCreateModal} className="btn-thick-navy text-sm px-6 py-2.5 font-semibold">
                Create Fiscal Year
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {fiscalYears.map((fy) => {
                const isExpanded = expandedFY.has(fy.id);
                const openCount = fy.periods.filter((p) => p.status === 'open').length;
                const closedCount = fy.periods.filter((p) => p.status === 'closed').length;
                const lockedCount = fy.periods.filter((p) => p.status === 'locked').length;

                return (
                  <div key={fy.id} className="bg-white overflow-hidden">
                    {/* FY Header */}
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--surface-header)] transition-colors"
                      onClick={() => toggleExpandFY(fy.id)}
                    >
                      <div className="flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-[var(--text-secondary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <div>
                          <span className="font-semibold text-[var(--text-primary)] text-[15px]">{fy.year_label}</span>
                          <span className="ml-3 text-sm text-[var(--text-secondary)] tabular-nums">{formatDate(fy.start_date)} — {formatDate(fy.end_date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          {openCount > 0 && <span>{openCount} open</span>}
                          {closedCount > 0 && <span>{closedCount} closed</span>}
                          {lockedCount > 0 && <span>{lockedCount} locked</span>}
                        </div>
                        <span className={STATUS_BADGE[fy.status].class}>{STATUS_BADGE[fy.status].label}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(fy); }}
                          className="btn-thick-white text-xs font-medium px-3 py-1.5"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFYStatus(fy); }}
                          className="btn-thick-white text-xs font-medium px-3 py-1.5"
                        >
                          {fy.status === 'open' ? 'Close Year' : 'Reopen Year'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete ${fy.year_label}? This will remove all its periods.`)) return;
                            fetch(`/api/fiscal-years/${fy.id}`, { method: 'DELETE' }).then(async (res) => {
                              if (res.ok) setRefreshKey(k => k + 1);
                              else { const j = await res.json(); alert(j.error || 'Failed to delete'); }
                            });
                          }}
                          className="btn-thick-red text-xs font-medium px-3 py-1.5"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Periods table */}
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
                              <th className="px-3 py-2.5 w-[200px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fy.periods.map((p, i) => (
                              <tr key={p.id} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                                <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{p.period_number}</td>
                                <td className="px-3 py-3 text-[var(--text-primary)] font-medium">{formatPeriodLabel(p.start_date)}</td>
                                <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(p.start_date)}</td>
                                <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(p.end_date)}</td>
                                <td className="px-3 py-3">
                                  <span className={STATUS_BADGE[p.status].class}>{STATUS_BADGE[p.status].label}</span>
                                </td>
                                <td className="px-3 py-3">
                                  {p.status === 'locked' ? (
                                    <span className="text-xs text-[var(--text-secondary)]">Permanently locked</span>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {p.status === 'open' && (
                                        <>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'closed')}
                                            className="btn-thick-white text-xs font-medium px-3 py-1.5"
                                          >
                                            Close
                                          </button>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'locked')}
                                            className="btn-thick-red text-xs font-medium px-3 py-1.5"
                                          >
                                            Lock
                                          </button>
                                        </>
                                      )}
                                      {p.status === 'closed' && (
                                        <>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'open')}
                                            className="btn-thick-white text-xs font-medium px-3 py-1.5"
                                          >
                                            Reopen
                                          </button>
                                          <button
                                            onClick={() => changePeriodStatus(fy.id, p, 'locked')}
                                            className="btn-thick-red text-xs font-medium px-3 py-1.5"
                                          >
                                            Lock
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
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

      {/* === CREATE FISCAL YEAR MODAL === */}
      {showModal && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setShowModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowModal(false)}>
            <div className="bg-white shadow-2xl w-full max-w-[480px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 bg-[var(--primary)]">
                <span className="text-white font-bold text-sm uppercase tracking-widest">Create Fiscal Year</span>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {modalError && (
                  <div className="bg-[var(--error-container)] p-3">
                    <p className="text-sm text-[var(--on-error-container)]">{modalError}</p>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Label *</label>
                  <input type="text" value={modalLabel} onChange={(e) => setModalLabel(e.target.value)} className="input-field w-full" placeholder="e.g. FY2026" autoFocus />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Start Month</label>
                    <select value={modalMonth} onChange={(e) => setModalMonth(Number(e.target.value))} className="input-field w-full">
                      {FULL_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Start Year</label>
                    <input type="number" value={modalYear} onChange={(e) => setModalYear(Number(e.target.value))} className="input-field w-full" min={2020} max={2040} />
                  </div>
                </div>

                <div className="bg-[var(--surface-low)] p-3 text-sm text-[var(--text-secondary)]">
                  <span className="font-medium">Preview:</span> {FULL_MONTHS[modalMonth]} {modalYear} — {FULL_MONTHS[(modalMonth + 11) % 12]} {modalMonth === 0 ? modalYear : modalYear + 1}
                  <br />
                  <span className="text-xs text-[var(--text-secondary)]">12 monthly periods will be created automatically.</span>
                </div>
              </div>

              <div className="p-4 flex-shrink-0 flex gap-3 bg-[var(--surface-low)]">
                <button onClick={submitCreate} disabled={modalSaving} className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40">
                  {modalSaving ? 'Creating...' : 'Create Fiscal Year'}
                </button>
                <button onClick={() => setShowModal(false)} disabled={modalSaving} className="btn-thick-white flex-1 py-2 text-sm font-semibold disabled:opacity-40">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {/* === EDIT FISCAL YEAR MODAL === */}
      {editFY && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setEditFY(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setEditFY(null)}>
            <div className="bg-white shadow-2xl w-full max-w-[480px] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
              <div className="h-14 flex items-center justify-between px-5 bg-[var(--primary)]">
                <span className="text-white font-bold text-sm uppercase tracking-widest">Edit Fiscal Year</span>
                <button onClick={() => setEditFY(null)} className="text-white/70 hover:text-white text-xl">&times;</button>
              </div>
              <div className="p-5 space-y-4">
                {editError && <p className="text-sm text-[var(--on-error-container)] bg-[var(--error-container)] px-3 py-2">{editError}</p>}
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Label</label>
                  <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="input-field w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Start Date</label>
                    <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">End Date</label>
                    <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="input-field w-full" />
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Monthly periods will be regenerated based on the new dates.</p>
              </div>
              <div className="p-4 flex gap-3 bg-[var(--surface-low)]">
                <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditFY(null)} className="btn-thick-white flex-1 py-2 text-sm font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
