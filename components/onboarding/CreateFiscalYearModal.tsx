'use client';

import { useState } from 'react';

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface CreateFiscalYearModalProps {
  firmId: string;
  onComplete: () => void;
  onClose: () => void;
}

export default function CreateFiscalYearModal({ firmId, onComplete, onClose }: CreateFiscalYearModalProps) {
  const currentYear = new Date().getFullYear();
  const [label, setLabel] = useState(`FY${currentYear}`);
  const [month, setMonth] = useState(0); // January
  const [year, setYear] = useState(currentYear);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!label.trim()) { setError('Label is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmId,
          yearLabel: label.trim(),
          startMonth: month,
          startYear: year,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create fiscal year');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create fiscal year');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-[480px] flex flex-col animate-in" onClick={e => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-5 bg-[var(--primary)]">
          <span className="text-white font-bold text-sm uppercase tracking-widest">Create Fiscal Year</span>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-[var(--error-container)] p-3">
              <p className="text-sm text-[var(--on-error-container)]">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Label *</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} className="input-recessed w-full" placeholder="e.g. FY2026" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Start Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-recessed w-full">
                {FULL_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Start Year</label>
              <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="input-recessed w-full" min={2020} max={2040} />
            </div>
          </div>

          <div className="bg-[var(--surface-low)] p-3 text-sm text-[var(--text-secondary)]">
            <span className="font-medium">Preview:</span> {FULL_MONTHS[month]} {year} — {FULL_MONTHS[(month + 11) % 12]} {month === 0 ? year : year + 1}
            <br />
            <span className="text-xs">12 monthly periods will be created automatically.</span>
          </div>
        </div>

        <div className="p-4 flex-shrink-0 flex gap-3 bg-[var(--surface-low)]">
          <button onClick={submit} disabled={saving} className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Creating...' : 'Create Fiscal Year'}
          </button>
          <button onClick={onClose} disabled={saving} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
