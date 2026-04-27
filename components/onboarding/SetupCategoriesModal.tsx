'use client';

import { useState, useEffect, useRef } from 'react';

interface CategoryRow {
  id: string;
  name: string;
  gl_account_id: string | null;
  gl_account_label: string | null;
  is_global: boolean;
}

interface GlAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
}

interface Props {
  firmId: string;
  onComplete: () => void;
  onClose: () => void;
}

export default function SetupCategoriesModal({ firmId, onComplete, onClose }: Props) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Track GL changes: categoryId → glAccountId
  const [glMap, setGlMap] = useState<Record<string, string>>({});

  // Cache per firm — persists across modal reopen
  const cacheRef = useRef<Record<string, { categories: CategoryRow[]; glAccounts: GlAccount[] }>>({});

  useEffect(() => {
    if (cacheRef.current[firmId]) {
      const cached = cacheRef.current[firmId];
      setCategories(cached.categories);
      setGlAccounts(cached.glAccounts);
      const existing: Record<string, string> = {};
      for (const c of cached.categories) { if (c.gl_account_id) existing[c.id] = c.gl_account_id; }
      setGlMap(existing);
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`/api/categories?firmId=${firmId}`).then(r => r.json()),
      fetch(`/api/gl-accounts?firmId=${firmId}`).then(r => r.json()),
    ]).then(([catJson, glJson]) => {
      const cats: CategoryRow[] = (catJson.data ?? []).filter((c: CategoryRow & { is_active: boolean }) => c.is_active);
      const gl = glJson.data ?? [];
      cacheRef.current[firmId] = { categories: cats, glAccounts: gl };
      setCategories(cats);
      setGlAccounts(gl);

      // Pre-fill existing mappings
      const existing: Record<string, string> = {};
      for (const c of cats) {
        if (c.gl_account_id) existing[c.id] = c.gl_account_id;
      }
      setGlMap(existing);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [firmId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    let saved = 0;

    for (const [catId, glId] of Object.entries(glMap)) {
      const cat = categories.find(c => c.id === catId);
      if (!cat) continue;
      // Skip if unchanged
      if (cat.gl_account_id === glId) { saved++; continue; }

      try {
        const res = await fetch(`/api/categories/${catId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firmId, gl_account_id: glId || null }),
        });
        if (res.ok) saved++;
      } catch { /* continue */ }
    }

    if (saved > 0) {
      window.dispatchEvent(new Event('setup-step-completed'));
      onComplete();
    } else {
      setError('Failed to save mappings');
      setSaving(false);
    }
  };

  const expenseAccounts = glAccounts.filter(a => a.account_type === 'Expense');
  const mappedCount = Object.values(glMap).filter(v => v).length;

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-2xl flex flex-col animate-in" onClick={e => e.stopPropagation()}>
        <div className="bg-[var(--primary)] px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white uppercase tracking-wide">Category → GL Mapping</h2>
          <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">Map each category to a default GL expense account. When employees select a category, the accountant will see this GL suggestion.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading...</div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">No categories found. Categories are created on the Categories page.</div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border border-[#E0E3E5]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="ds-table-header text-left bg-[var(--surface-header)]">
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">GL Account (Expense)</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={cat.id} className={i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}>
                      <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                        {cat.name}
                        {cat.is_global && <span className="text-[9px] text-[var(--text-muted)] ml-1.5 uppercase">Global</span>}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={glMap[cat.id] ?? ''}
                          onChange={e => setGlMap(prev => ({ ...prev, [cat.id]: e.target.value }))}
                          className="input-recessed w-full text-xs"
                        >
                          <option value="">Not mapped</option>
                          {expenseAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[var(--text-muted)]">{mappedCount} of {categories.length} mapped</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-thick-white px-4 py-2 text-sm font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving || loading || categories.length === 0} className="btn-approve px-4 py-2 text-sm font-bold disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Mappings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
