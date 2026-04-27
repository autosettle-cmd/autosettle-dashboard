'use client';

import { useState, useRef } from 'react';

interface FirmOption {
  id: string;
  name: string;
}

interface ParsedAccount {
  account_code: string;
  name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  normal_balance: 'Debit' | 'Credit';
  parent_code: string | null;
}

interface SetupCoaModalProps {
  firmId: string;
  firms: FirmOption[];
  onComplete: () => void;
  onClose: () => void;
}

type Tab = 'template' | 'copy' | 'upload';

const TYPE_BADGE: Record<string, string> = {
  Asset: 'badge-blue',
  Liability: 'badge-amber',
  Equity: 'badge-green',
  Revenue: 'badge-green',
  Expense: 'badge-red',
};

export default function SetupCoaModal({ firmId, firms, onComplete, onClose }: SetupCoaModalProps) {
  const [tab, setTab] = useState<Tab>('template');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Template
  const [templateType, setTemplateType] = useState<'malaysian' | 'sql'>('malaysian');

  // Copy
  const [sourceFirmId, setSourceFirmId] = useState('');
  const otherFirms = firms.filter(f => f.id !== firmId);

  // Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsedAccounts, setParsedAccounts] = useState<ParsedAccount[] | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());

  const handleSeedTemplate = async () => {
    setLoading(true);
    setError('');
    try {
      if (templateType === 'malaysian') {
        const res = await fetch('/api/gl-accounts/seed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firmId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to seed COA');
        setSuccess(json.data?.message || 'COA seeded successfully');
      } else {
        const res = await fetch('/api/gl-accounts/import-sql-accounting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firmId, confirm: 'REPLACE_COA' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to import SQL Accounting COA');
        setSuccess(json.data?.message || 'SQL Accounting COA imported successfully');
      }
      setTimeout(onComplete, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed COA');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!sourceFirmId) { setError('Select a firm to copy from'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gl-accounts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFirmId, targetFirmId: firmId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to copy COA');
      setSuccess(json.data?.message || 'COA copied successfully');
      setTimeout(onComplete, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy COA');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadParse = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Select a PDF file'); return; }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/gl-accounts/parse-pdf', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to parse PDF');
      setParsedAccounts(json.data.accounts);
      setRemovedIndices(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleImportParsed = async () => {
    if (!parsedAccounts) return;
    const accounts = parsedAccounts.filter((_, i) => !removedIndices.has(i));
    if (accounts.length === 0) { setError('No accounts to import'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gl-accounts/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, accounts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to import accounts');
      setSuccess(json.data?.message || 'COA imported successfully');
      setTimeout(onComplete, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import accounts');
    } finally {
      setLoading(false);
    }
  };

  const toggleRemove = (i: number) => {
    setRemovedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'template', label: 'Use Template', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { key: 'copy', label: 'Copy from Firm', icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { key: 'upload', label: 'Upload PDF', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
  ];

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[var(--primary)] px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white uppercase tracking-wide">Chart of Accounts Setup</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Success banner */}
        {success && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600"><path d="M20 6L9 17l-5-5" /></svg>
            <p className="text-sm font-medium text-emerald-800">{success}</p>
          </div>
        )}

        {/* Tabs */}
        {!success && (
          <div className="flex border-b border-[#E0E3E5]">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(''); setParsedAccounts(null); }}
                className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${
                  tab === t.key
                    ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--surface-low)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {!success && (
          <div className="flex-1 overflow-y-auto p-5">
            {error && (
              <div className="mb-4 bg-[var(--error-container)] p-3">
                <p className="text-sm text-[var(--on-error-container)]">{error}</p>
              </div>
            )}

            {/* Template Tab */}
            {tab === 'template' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">Choose a pre-built chart of accounts template. Includes GL accounts, tax codes, and category mappings.</p>

                <div className="space-y-3">
                  <label
                    className={`block p-4 border-2 cursor-pointer transition-all ${
                      templateType === 'malaysian'
                        ? 'border-[var(--primary)] bg-blue-50/50'
                        : 'border-[#E0E3E5] hover:border-[var(--primary)]/30'
                    }`}
                    onClick={() => setTemplateType('malaysian')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        templateType === 'malaysian' ? 'border-[var(--primary)]' : 'border-[#C0C4C8]'
                      }`}>
                        {templateType === 'malaysian' && <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Malaysian SME Default</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">~89 accounts, standard Malaysian COA structure</p>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`block p-4 border-2 cursor-pointer transition-all ${
                      templateType === 'sql'
                        ? 'border-[var(--primary)] bg-blue-50/50'
                        : 'border-[#E0E3E5] hover:border-[var(--primary)]/30'
                    }`}
                    onClick={() => setTemplateType('sql')}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        templateType === 'sql' ? 'border-[var(--primary)]' : 'border-[#C0C4C8]'
                      }`}>
                        {templateType === 'sql' && <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">SQL Accounting</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">~96 accounts, SQL Accounting compatible codes</p>
                      </div>
                    </div>
                  </label>
                </div>

                <button
                  onClick={handleSeedTemplate}
                  disabled={loading}
                  className="btn-thick-navy w-full py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? 'Setting up...' : `Seed ${templateType === 'malaysian' ? 'Malaysian SME' : 'SQL Accounting'} Template`}
                </button>
              </div>
            )}

            {/* Copy Tab */}
            {tab === 'copy' && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">Copy the chart of accounts from another firm you manage. Includes GL accounts, category mappings, and tax codes.</p>

                {otherFirms.length === 0 ? (
                  <div className="bg-[var(--surface-low)] p-4 text-center text-sm text-[var(--text-secondary)]">
                    No other firms available to copy from.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Copy from</label>
                      <select
                        value={sourceFirmId}
                        onChange={e => setSourceFirmId(e.target.value)}
                        className="input-recessed w-full"
                      >
                        <option value="">Select a firm...</option>
                        {otherFirms.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleCopy}
                      disabled={loading || !sourceFirmId}
                      className="btn-thick-navy w-full py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Copying...' : 'Copy Chart of Accounts'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Upload Tab */}
            {tab === 'upload' && (
              <div className="space-y-4">
                {!parsedAccounts ? (
                  <>
                    <p className="text-sm text-[var(--text-secondary)]">Upload a PDF of your chart of accounts. AI will extract and structure the accounts for your review.</p>

                    {loading ? (
                      <div className="py-8 text-center space-y-4">
                        <svg className="animate-spin h-8 w-8 mx-auto text-[var(--primary)]" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">Extracting accounts from PDF...</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">AI is reading and structuring your chart of accounts</p>
                        </div>
                        {/* Indeterminate progress bar */}
                        <div className="w-full h-1.5 bg-[var(--surface-header)] overflow-hidden">
                          <div className="h-full bg-[var(--primary)] animate-pulse" style={{ width: '60%', animation: 'indeterminate 1.5s ease-in-out infinite' }} />
                        </div>
                        <style>{`@keyframes indeterminate { 0% { margin-left: -30%; width: 30%; } 50% { margin-left: 20%; width: 60%; } 100% { margin-left: 100%; width: 30%; } }`}</style>
                      </div>
                    ) : (
                      <>
                        <div className={`border-2 border-dashed p-6 text-center ${selectedFileName ? 'border-[var(--primary)] bg-blue-50/30' : 'border-[#C0C4C8]'}`}>
                          <input
                            ref={fileRef}
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            id="coa-upload"
                            onChange={(e) => { setError(''); setSelectedFileName(e.target.files?.[0]?.name || ''); }}
                          />
                          <label htmlFor="coa-upload" className="cursor-pointer">
                            {selectedFileName ? (
                              <>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                                <p className="text-sm font-semibold text-[var(--primary)]">{selectedFileName}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Click to change file</p>
                              </>
                            ) : (
                              <>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-[var(--text-secondary)] mb-2"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                <p className="text-sm font-medium text-[var(--text-primary)]">Click to select PDF</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">Chart of Accounts listing from any accounting software</p>
                              </>
                            )}
                          </label>
                        </div>

                        <button
                          onClick={handleUploadParse}
                          disabled={!selectedFileName}
                          className="btn-thick-navy w-full py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Parse PDF
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {parsedAccounts.length - removedIndices.size} of {parsedAccounts.length} accounts selected
                      </p>
                      <button
                        onClick={() => { setParsedAccounts(null); setRemovedIndices(new Set()); }}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                      >
                        Re-upload
                      </button>
                    </div>

                    <div className="max-h-[40vh] overflow-y-auto border border-[#E0E3E5]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="ds-table-header text-left">
                            <th className="px-3 py-2 w-8"></th>
                            <th className="px-3 py-2">Code</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Parent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedAccounts.map((a, i) => (
                            <tr
                              key={i}
                              className={`${removedIndices.has(i) ? 'opacity-30 line-through' : ''} ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} hover:bg-[var(--surface-header)] transition-colors`}
                            >
                              <td className="px-3 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!removedIndices.has(i)}
                                  onChange={() => toggleRemove(i)}
                                  className="cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-1.5 font-mono font-medium text-[var(--text-primary)]">{a.account_code}</td>
                              <td className="px-3 py-1.5 text-[var(--text-primary)]">{a.name}</td>
                              <td className="px-3 py-1.5"><span className={TYPE_BADGE[a.account_type] || 'badge-gray'}>{a.account_type}</span></td>
                              <td className="px-3 py-1.5 font-mono text-[var(--text-secondary)]">{a.parent_code || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={handleImportParsed}
                      disabled={loading || parsedAccounts.length - removedIndices.size === 0}
                      className="btn-thick-navy w-full py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Importing...' : `Import ${parsedAccounts.length - removedIndices.size} Accounts`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
