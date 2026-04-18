'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
import { formatRM } from '@/lib/formatters';

interface StatementRow {
  id: string;
  bank_name: string;
  account_number: string | null;
  statement_date: string;
  opening_balance: string | null;
  closing_balance: string | null;
  file_name: string;
  file_url: string | null;
  created_at: string;
  total: number;
  matched: number;
  unmatched: number;
  excluded: number;
}

function formatDate(val: string) {
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

export default function BankReconciliationPage() {
  usePageTitle('Bank Reconciliation');
  const router = useRouter();

  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; results: { name: string; ok: boolean; msg: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [reuploadId, setReuploadId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Transaction search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    id: string; transaction_date: string; description: string; reference: string | null;
    amount: number; type: string; bank_name: string; account_number: string | null;
    statement_id: string; statement_date: string;
    matching_invoices: { id: string; invoice_number: string; vendor_name: string; total_amount: number; balance: number; exact_match: boolean }[];
  }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback((q: string) => {
    clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/bank-reconciliation/search?q=${encodeURIComponent(q.trim())}`)
        .then(r => r.json())
        .then(j => setSearchResults(j.data ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
  }, []);

  const loadStatements = () => {
    fetch('/api/admin/bank-reconciliation/statements')
      .then((r) => r.json())
      .then((j) => { setStatements(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadStatements(); }, []);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError('');

    // Single file — original flow (supports password prompt)
    if (files.length === 1) {
      const fd = new FormData();
      fd.append('file', files[0]);
      if (pdfPassword) fd.append('password', pdfPassword);

      try {
        const res = await fetch('/api/admin/bank-reconciliation/upload', { method: 'POST', body: fd });
        if (!res.ok && !res.headers.get('content-type')?.includes('json')) {
          setUploadError(`Server error (${res.status}).`);
          setUploading(false);
          return;
        }
        const json = await res.json();

        if (json.error === 'PASSWORD_REQUIRED') {
          setNeedsPassword(true);
          setUploadError('This PDF is password-protected. Please enter the password.');
          setUploading(false);
          return;
        }

        if (json.error) { setUploadError(json.error); setUploading(false); return; }
        setUploading(false);
        setShowUpload(false);
        setNeedsPassword(false);
        setPdfPassword('');
        const d = json.data;
        if (d.warning) {
          alert(`⚠️ ${d.warning}`);
        }
        if (d.skippedDuplicates > 0) {
          alert(`Parsed ${d.totalParsed} transactions — ${d.skippedDuplicates} duplicates skipped, ${d.transactionCount} new.`);
        }
        router.push(`/admin/bank-reconciliation/${d.statementId}`);
      } catch (e) {
        setUploadError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
        setUploading(false);
      }
      return;
    }

    // Multiple files — batch upload with progress
    const fileList = Array.from(files);
    const results: { name: string; ok: boolean; msg: string }[] = [];
    setBatchProgress({ current: 0, total: fileList.length, results });

    for (let i = 0; i < fileList.length; i++) {
      setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });
      try {
        const fd = new FormData();
        fd.append('file', fileList[i]);
        const res = await fetch('/api/admin/bank-reconciliation/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (res.status === 409) {
          results.push({ name: fileList[i].name, ok: true, msg: 'Already uploaded — skipped' });
        } else if (json.error) {
          results.push({ name: fileList[i].name, ok: false, msg: json.error });
        } else {
          const d = json.data;
          const warnings = [];
          if (d.warning) warnings.push('Gemini fallback');
          if (d.skippedDuplicates > 0) warnings.push(`${d.skippedDuplicates} dupes skipped`);
          results.push({ name: fileList[i].name, ok: true, msg: `${d.transactionCount} transactions${warnings.length ? ' (' + warnings.join(', ') + ')' : ''}` });
        }
      } catch (e) {
        results.push({ name: fileList[i].name, ok: false, msg: e instanceof Error ? e.message : 'Failed' });
      }
      setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });
    }

    setUploading(false);
    loadStatements();
  };

  // ─── Drag & Drop ────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (files.length === 0) return;

    setUploading(true);
    setUploadError('');
    const results: { name: string; ok: boolean; msg: string }[] = [];
    setBatchProgress({ current: 0, total: files.length, results });
    setShowUpload(true);

    for (let i = 0; i < files.length; i++) {
      setBatchProgress({ current: i + 1, total: files.length, results: [...results] });
      try {
        const fd = new FormData();
        fd.append('file', files[i]);
        const res = await fetch('/api/admin/bank-reconciliation/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (res.status === 409) {
          results.push({ name: files[i].name, ok: true, msg: 'Already uploaded — skipped' });
        } else if (json.error) {
          results.push({ name: files[i].name, ok: false, msg: json.error });
        } else {
          const d = json.data;
          const warnings = [];
          if (d.warning) warnings.push('Gemini fallback');
          if (d.skippedDuplicates > 0) warnings.push(`${d.skippedDuplicates} dupes skipped`);
          results.push({ name: files[i].name, ok: true, msg: `${d.transactionCount} transactions${warnings.length ? ' (' + warnings.join(', ') + ')' : ''}` });
        }
      } catch (err) {
        results.push({ name: files[i].name, ok: false, msg: err instanceof Error ? err.message : 'Failed' });
      }
      setBatchProgress({ current: i + 1, total: files.length, results: [...results] });
    }

    setUploading(false);
    loadStatements();
  };

  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('Delete this bank statement and all its transactions? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/bank-reconciliation/statements/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementId }),
      });
      if (res.ok) {
        setStatements((prev) => prev.filter((s) => s.id !== statementId));
      }
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const handleReuploadPdf = async (file: File) => {
    if (!reuploadId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('statement_id', reuploadId);
    try {
      const res = await fetch('/api/admin/bank-reconciliation/reupload-pdf', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.data?.file_url) {
        setStatements((prev) => prev.map((s) => s.id === reuploadId ? { ...s, file_url: json.data.file_url } : s));
      }
    } catch (e) {
      console.error('Re-upload failed:', e);
    }
    setReuploadId(null);
  };

  return (
    <div className="flex h-screen overflow-hidden paper-texture">
      <Sidebar role="admin" />

      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-blue-600/10 border-2 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
            <div className="bg-white shadow-lg px-8 py-6 text-center">
              <svg className="w-10 h-10 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Drop PDF files to upload</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Bank statements will be parsed automatically</p>
            </div>
          </div>
        )}

        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Bank Reconciliation</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search amount, description..."
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  doSearch(q);
                }}
                className="input-field w-64 text-body-sm pr-8"
              />
              {searchLoading && <span className="absolute right-2.5 top-2.5 text-xs text-[var(--text-secondary)]">...</span>}
              {searchQuery && !searchLoading && (
                <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-2.5 top-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm">&times;</button>
              )}
            </div>
            <button onClick={() => setShowUpload(true)} className="btn-thick-navy px-3 py-1.5 text-body-md font-medium">
              Upload Statement
            </button>
          </div>
        </header>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mx-6 mb-4 bg-white border border-[var(--surface-header)] shadow-sm max-h-96 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-[var(--surface-header)] bg-[var(--surface-low)]">
              <p className="text-body-sm font-semibold text-[var(--text-secondary)]">{searchResults.length} unmatched transaction{searchResults.length !== 1 ? 's' : ''} found</p>
            </div>
            <div className="divide-y divide-[var(--surface-low)]">
              {searchResults.map(txn => (
                <div
                  key={txn.id}
                  className="px-4 py-3 hover:bg-[var(--surface-low)] cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/bank-reconciliation/${txn.statement_id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-body-sm font-semibold tabular-nums ${txn.type === 'debit' ? 'text-[var(--reject-red)]' : 'text-[var(--match-green)]'}`}>
                          {txn.type === 'debit' ? '-' : '+'}RM {txn.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">{formatDate(txn.transaction_date)}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{txn.bank_name} {txn.account_number}</span>
                      </div>
                      <p className="text-body-sm text-[var(--text-secondary)] truncate">{txn.description}</p>
                      {txn.reference && <p className="text-xs text-[var(--text-secondary)]">Ref: {txn.reference}</p>}
                    </div>
                    {txn.matching_invoices.length > 0 && (
                      <div className="flex-shrink-0 text-right space-y-0.5">
                        <p className="text-xs text-[var(--text-secondary)] font-medium">Possible invoice match:</p>
                        {txn.matching_invoices.map(inv => (
                          <div key={inv.id} className="text-xs">
                            <span className={`font-medium ${inv.exact_match ? 'text-[var(--match-green)]' : 'text-[var(--text-secondary)]'}`}>
                              {inv.invoice_number || 'No #'}
                            </span>
                            <span className="text-[var(--text-secondary)] ml-1">{inv.vendor_name}</span>
                            <span className="text-[var(--text-secondary)] ml-1 tabular-nums">Bal: RM {inv.balance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                            {inv.exact_match && <span className="ml-1 text-[var(--match-green)] font-medium">exact</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-8 pl-14 animate-in ledger-binding">
          {/* Upload modal */}
          {showUpload && (
            <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
              <div className="bg-white shadow-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-title-md font-bold text-[var(--text-primary)] uppercase tracking-widest">Upload Bank Statement</h2>
                  <button onClick={() => setShowUpload(false)} className="w-8 h-8 bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-header)] transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">PDF File</label>
                    <input ref={fileRef} type="file" accept=".pdf" multiple className="input-recessed w-full text-body-md" onChange={() => { setNeedsPassword(false); setPdfPassword(''); setUploadError(''); setBatchProgress(null); }} />
                  </div>
                  {needsPassword && (
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">PDF Password</label>
                      <input type="password" value={pdfPassword} onChange={(e) => setPdfPassword(e.target.value)} placeholder="Enter PDF password" className="input-recessed w-full text-body-md" autoFocus />
                    </div>
                  )}
                  {uploadError && <p className="text-body-sm text-[var(--reject-red)]">{uploadError}</p>}

                  {/* Batch progress */}
                  {batchProgress && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                        <span>Processing {batchProgress.current} of {batchProgress.total}</span>
                        <span className="tabular-nums">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-[var(--surface-header)] h-2">
                        <div className="bg-[var(--primary)] h-2 transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                      </div>
                      {batchProgress.results.length > 0 && (
                        <div className="max-h-[200px] overflow-y-auto space-y-1">
                          {batchProgress.results.map((r, i) => (
                            <div key={i} className={`text-xs px-2 py-1 ${r.ok ? 'bg-green-50 text-[var(--match-green)]' : 'bg-red-50 text-[var(--reject-red)]'}`}>
                              <span className="font-medium">{r.name}</span>: {r.msg}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => { setShowUpload(false); setBatchProgress(null); }} className={`flex-1 px-3 py-2 text-body-md ${batchProgress && !uploading ? 'btn-thick-green text-white' : 'btn-thick-white'}`}>
                      {batchProgress && !uploading ? 'Done' : 'Cancel'}
                    </button>
                    {!batchProgress && (
                      <button onClick={handleUpload} disabled={uploading} className="btn-thick-navy flex-1 px-3 py-2 text-body-md disabled:opacity-50">
                        {uploading ? 'Processing...' : 'Upload & Parse'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hidden input for PDF re-upload */}
          <input ref={reuploadRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReuploadPdf(f); e.target.value = ''; }} />

          {loading ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-secondary)]">No bank statements uploaded yet</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Upload a PDF bank statement to get started.</p>
            </div>
          ) : (() => {
            const groups = new Map<string, { bank: string; account: string; statements: StatementRow[] }>();
            for (const s of statements) {
              const key = `${s.bank_name}|${s.account_number ?? 'NA'}`;
              if (!groups.has(key)) groups.set(key, { bank: s.bank_name, account: s.account_number ?? '-', statements: [] });
              groups.get(key)!.statements.push(s);
            }
            return (
            <div className="space-y-3">
              {Array.from(groups.entries()).map(([key, group]) => {
                const isOpen = expandedAccount === key;
                const needsAttention = group.statements.some(s => s.unmatched > 0);
                const totalStmts = group.statements.length;
                const latestBalance = group.statements[0]?.closing_balance;
                const totalUnmatched = group.statements.reduce((s, st) => s + st.unmatched, 0);
                return (
                  <div key={key} className={`bg-white card-popped ${needsAttention ? 'border border-amber-200' : ''}`}>
                    <div className={`flex items-center justify-between px-6 py-3.5 cursor-pointer transition-colors ${isOpen ? 'bg-[var(--surface-low)]' : 'hover:bg-[var(--surface-low)]'}`}
                      onClick={() => setExpandedAccount(isOpen ? null : key)}>
                      <div className="flex items-center gap-3">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-title-sm font-semibold text-[var(--text-primary)]">{group.bank}</p>
                            <span className="text-body-md text-[var(--text-secondary)] tabular-nums">{group.account}</span>
                          </div>
                          <p className="text-label-sm text-[var(--text-secondary)] mt-0.5">
                            {totalStmts} statement{totalStmts !== 1 ? 's' : ''} · Latest balance: <span className="tabular-nums">{formatRM(latestBalance)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {needsAttention ? (
                          <span className="text-label-sm font-medium text-amber-600 bg-amber-50 px-2 py-0.5">{totalUnmatched} unmatched</span>
                        ) : (
                          <span className="text-label-sm font-medium text-[var(--match-green)] bg-green-50 px-2 py-0.5">All reconciled</span>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <table className="w-full">
                        <thead>
                          <tr className="bg-[var(--surface-header)]">
                            <th className="px-6 py-2 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Period</th>
                            <th className="px-6 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Closing Balance</th>
                            <th className="px-6 py-2 text-center text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Txns</th>
                            <th className="px-6 py-2 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Progress</th>
                            <th className="px-6 py-2 text-center text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Unmatched</th>
                            <th className="px-6 py-2 text-center text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">PDF</th>
                            <th className="px-3 py-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.statements.map((s, idx) => {
                            const resolved = s.matched + s.excluded;
                            const pct = s.total > 0 ? Math.round((resolved / s.total) * 100) : 0;
                            const isComplete = s.unmatched === 0;
                            return (
                              <tr key={s.id} onClick={() => router.push(`/admin/bank-reconciliation/${s.id}`)}
                                className={`group transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} ${isComplete ? 'hover:bg-green-50/40' : 'hover:bg-amber-50/40'}`}>
                                <td className="px-6 py-2.5">
                                  <p className="text-body-md font-medium text-[var(--text-primary)] tabular-nums">{formatDate(s.statement_date)}</p>
                                  {!isComplete && <p className="text-label-sm text-amber-600 font-medium">Needs attention</p>}
                                </td>
                                <td className="px-6 py-2.5 text-body-md text-right tabular-nums text-[var(--text-primary)]">{formatRM(s.closing_balance)}</td>
                                <td className="px-6 py-2.5 text-body-md text-center text-[var(--text-secondary)] tabular-nums">{s.total}</td>
                                <td className="px-6 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-[var(--surface-header)] overflow-hidden">
                                      <div className={`h-full ${isComplete ? 'bg-[var(--match-green)]' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-label-sm font-medium tabular-nums ${isComplete ? 'text-[var(--match-green)]' : 'text-amber-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  {s.unmatched > 0 ? <span className="text-body-sm font-semibold text-[var(--reject-red)] tabular-nums">{s.unmatched}</span> : <span className="text-body-sm text-[var(--match-green)] tabular-nums">0</span>}
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  {s.file_url ? (
                                    <a href={s.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="btn-thick-navy px-2 py-1 text-[10px] gap-1" title="Download PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      PDF
                                    </a>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setReuploadId(s.id); reuploadRef.current?.click(); }}
                                      className="btn-thick-white px-2 py-1 text-[10px] gap-1" title="Re-upload PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                      </svg>
                                      Upload
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteStatement(s.id); }}
                                    className="btn-thick-red w-7 h-7 !p-0 text-[10px]" title="Delete statement">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
