'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import BatchUploadOverlay from '@/components/BatchUploadOverlay';
import { usePageTitle } from '@/lib/use-page-title';
import GlAccountSelect from '@/components/GlAccountSelect';
import { useFirm } from '@/contexts/FirmContext';
import { formatRM } from '@/lib/formatters';
import SearchButton from '@/components/SearchButton';

type BatchResult = { name: string; ok: boolean; msg: string };

interface StatementRow {
  id: string;
  bank_name: string;
  account_number: string | null;
  statement_date: string;
  opening_balance: string | null;
  closing_balance: string | null;
  file_name: string;
  file_url: string | null;
  firm_name: string;
  firm_id: string;
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

export default function AccountantBankReconciliationPage() {
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
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [reuploadId, setReuploadId] = useState<string | null>(null);
  const { firms, firmId: firmFilter, firmsLoaded } = useFirm();
  const [uploadFirmId, setUploadFirmId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Bank GL mappings
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [bankGlMap, setBankGlMap] = useState<Record<string, { gl_account_id: string | null; gl_account_label: string | null }>>({});
  const [glEditKey, setGlEditKey] = useState<string | null>(null);
  const [glEditValue, setGlEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Auto-set upload firm when single firm
  useEffect(() => {
    if (firmsLoaded && firms.length === 1) setUploadFirmId(firms[0].id);
  }, [firmsLoaded, firms]);

  const isSingleFirm = firms.length === 1;

  const loadStatements = () => {
    const params = new URLSearchParams();
    if (firmFilter) params.set('firmId', firmFilter);
    fetch(`/api/bank-reconciliation/statements?${params}`)
      .then((r) => r.json())
      .then((j) => { setStatements(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { if (!firmsLoaded) return; setLoading(true); loadStatements(); }, [firmsLoaded, firmFilter]);

  // Load GL accounts + bank mappings when statements change
  useEffect(() => {
    if (statements.length === 0) return;
    const firmIdArr = Array.from(new Set(statements.map((s) => s.firm_id)));
    const firmId = firmFilter || (firmIdArr.length === 1 ? firmIdArr[0] : '');

    // Load bank mappings for all firms (display only)
    Promise.all(
      firmIdArr.map((fid) => fetch(`/api/accounting-settings?firmId=${fid}`).then((r) => r.json()))
    ).then((results) => {
      const mappings: Record<string, { gl_account_id: string | null; gl_account_label: string | null }> = {};
      for (const settingsJson of results) {
        for (const m of settingsJson.data?.bank_mappings ?? []) {
          mappings[`${m.bank_name}|${m.account_number}`] = { gl_account_id: m.gl_account_id, gl_account_label: m.gl_account_label };
        }
      }
      setBankGlMap(mappings);
    }).catch(console.error);

    // GL accounts only load when a specific firm is selected
    if (firmId) {
      fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()).then((j) => {
        setGlAccounts(j.data ?? []);
      }).catch(console.error);
    } else {
      setGlAccounts([]);
    }
  }, [statements.length, firmFilter]);

  // GL change confirmation modal
  const [glConfirm, setGlConfirm] = useState<{ bankName: string; accountNumber: string; glAccountId: string; oldLabel: string; newLabel: string } | null>(null);

  const saveBankGl = async (bankName: string, accountNumber: string, glAccountId: string) => {
    const key = `${bankName}|${accountNumber}`;
    const existing = bankGlMap[key];

    // If changing from an existing GL, show confirmation
    if (existing?.gl_account_id && existing.gl_account_id !== glAccountId) {
      const newGl = glAccounts.find((a) => a.id === glAccountId);
      setGlConfirm({
        bankName,
        accountNumber,
        glAccountId,
        oldLabel: existing.gl_account_label ?? 'Unknown',
        newLabel: newGl ? `${newGl.account_code} — ${newGl.name}` : 'Unknown',
      });
      return;
    }

    await doSaveBankGl(bankName, accountNumber, glAccountId);
  };

  const doSaveBankGl = async (bankName: string, accountNumber: string, glAccountId: string) => {
    const firmId = statements.find((s) => s.bank_name === bankName && (s.account_number ?? '') === accountNumber)?.firm_id;
    if (!firmId) return;
    await fetch('/api/accounting-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmId, bank_name: bankName, account_number: accountNumber, gl_account_id: glAccountId }),
    });
    const gl = glAccounts.find((a) => a.id === glAccountId);
    const key = `${bankName}|${accountNumber}`;
    setBankGlMap((prev) => ({ ...prev, [key]: { gl_account_id: glAccountId, gl_account_label: gl ? `${gl.account_code} — ${gl.name}` : null } }));
    setGlEditKey(null);
    setGlConfirm(null);
  };

  // Check duplicate before uploading a single file
  const checkDuplicate = useCallback(async (file: File): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/bank-reconciliation/check-duplicate', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.data?.isDuplicate) return json.data.message;
    } catch { /* non-blocking */ }
    return null;
  }, []);

  // Upload a single file, returns result
  const uploadSingleFile = useCallback(async (file: File, firmId: string, password?: string): Promise<BatchResult & { statementId?: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('firm_id', firmId);
    if (password) fd.append('password', password);
    const res = await fetch('/api/bank-reconciliation/upload', { method: 'POST', body: fd });
    if (!res.ok && !res.headers.get('content-type')?.includes('json')) {
      return { name: file.name, ok: false, msg: `Server error (${res.status})` };
    }
    const json = await res.json();
    if (res.status === 409) return { name: file.name, ok: true, msg: 'Already uploaded — skipped' };
    if (json.error === 'PASSWORD_REQUIRED') return { name: file.name, ok: false, msg: 'PASSWORD_REQUIRED' };
    if (json.error) return { name: file.name, ok: false, msg: json.error };
    const d = json.data;
    const warnings: string[] = [];
    if (d.warning) warnings.push('Gemini fallback');
    if (d.skippedDuplicates > 0) warnings.push(`${d.skippedDuplicates} dupes skipped`);
    return { name: file.name, ok: true, msg: `${d.transactionCount} transactions${warnings.length ? ' (' + warnings.join(', ') + ')' : ''}`, statementId: d.statementId };
  }, []);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0 || !uploadFirmId) return;

    setUploading(true);
    setUploadError('');

    // Single file — original flow (supports password prompt)
    if (files.length === 1) {
      // Dedup check first
      const dupMsg = await checkDuplicate(files[0]);
      if (dupMsg) {
        setUploadError(dupMsg);
        setUploading(false);
        return;
      }

      const result = await uploadSingleFile(files[0], uploadFirmId, pdfPassword || undefined);
      if (result.msg === 'PASSWORD_REQUIRED') {
        setNeedsPassword(true);
        setUploadError('This PDF is password-protected. Please enter the password.');
        setUploading(false);
        return;
      }
      if (!result.ok) { setUploadError(result.msg); setUploading(false); return; }

      setUploading(false);
      setShowUpload(false);
      setNeedsPassword(false);
      setPdfPassword('');
      if (result.statementId) router.push(`/accountant/bank-reconciliation/${result.statementId}`);
      return;
    }

    // Multiple files — batch upload with floating progress bar
    const fileList = Array.from(files);
    const results: BatchResult[] = [];
    setShowUpload(false); // close modal, show floating bar
    setBatchProgress({ current: 0, total: fileList.length, results });

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setBatchProgress({ current: i, total: fileList.length, results: [...results] });

      // Dedup check before upload
      const dupMsg = await checkDuplicate(file);
      if (dupMsg) {
        results.push({ name: file.name, ok: true, msg: 'Already uploaded — skipped' });
        setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });
        continue;
      }

      try {
        const result = await uploadSingleFile(file, uploadFirmId);
        results.push(result);
      } catch (e) {
        results.push({ name: file.name, ok: false, msg: e instanceof Error ? e.message : 'Failed' });
      }
      setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });
    }

    setUploading(false);
    loadStatements();
  };

  const [deleteError, setDeleteError] = useState('');

  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('Delete this bank statement and all its transactions? This cannot be undone.')) return;
    setDeleteError('');
    try {
      const res = await fetch('/api/bank-reconciliation/statements/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statementId }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setStatements((prev) => prev.filter((s) => s.id !== statementId));
      } else {
        const msg = json?.error || `Delete failed (${res.status})`;
        setDeleteError(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setDeleteError(msg);
    }
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

    // Need a firm selected — use firmFilter or single firm
    const targetFirmId = firmFilter || (firms.length === 1 ? firms[0].id : '');
    if (!targetFirmId) {
      window.dispatchEvent(new CustomEvent('highlight-firm-selector'));
      return;
    }

    // Start batch upload — floating bar (no modal)
    setUploading(true);
    setUploadError('');
    setUploadFirmId(targetFirmId);
    const results: BatchResult[] = [];
    setBatchProgress({ current: 0, total: files.length, results });

    for (let i = 0; i < files.length; i++) {
      setBatchProgress({ current: i, total: files.length, results: [...results] });

      // Dedup check before upload
      const dupMsg = await checkDuplicate(files[i]);
      if (dupMsg) {
        results.push({ name: files[i].name, ok: true, msg: 'Already uploaded — skipped' });
        setBatchProgress({ current: i + 1, total: files.length, results: [...results] });
        continue;
      }

      try {
        const result = await uploadSingleFile(files[i], targetFirmId);
        results.push(result);
      } catch (err) {
        results.push({ name: files[i].name, ok: false, msg: err instanceof Error ? err.message : 'Failed' });
      }
      setBatchProgress({ current: i + 1, total: files.length, results: [...results] });
    }

    setUploading(false);
    loadStatements();
  };

  const handleReuploadPdf = async (file: File) => {
    if (!reuploadId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('statement_id', reuploadId);
    try {
      const res = await fetch('/api/bank-reconciliation/reupload-pdf', { method: 'POST', body: fd });
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
      <Sidebar role="accountant" />

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
            {!uploading && <SearchButton />}
            <button onClick={() => setShowUpload(true)} disabled={uploading} className="btn-thick-navy px-3 py-1.5 text-body-md font-medium disabled:opacity-50">
              Upload Statement
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 pl-14 animate-in ledger-binding">
          {showUpload && (
            <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
              <div className="bg-white shadow-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-title-md font-bold text-[var(--text-primary)] uppercase tracking-widest mb-4">Upload Bank Statement</h2>
                <div className="space-y-3">
                  {!isSingleFirm && (
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Client Firm</label>
                    <select value={uploadFirmId} onChange={(e) => setUploadFirmId(e.target.value)} className="input-recessed w-full text-body-md">
                      <option value="">Select firm...</option>
                      {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  )}
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
                      <button onClick={handleUpload} disabled={uploading || !uploadFirmId} className="btn-thick-navy flex-1 px-3 py-2 text-body-md disabled:opacity-50">
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

          {deleteError && (
            <div className="mb-4 bg-red-50 border border-red-200 px-4 py-3 text-sm text-[var(--reject-red)] flex items-center justify-between">
              <span>{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="text-[var(--reject-red)] font-bold ml-4">✕</button>
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-secondary)]">No bank statements uploaded yet</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Upload a PDF bank statement to get started.</p>
            </div>
          ) : (() => {
            // Group statements by bank account
            const groups = new Map<string, { bank: string; account: string; firmName: string; statements: StatementRow[] }>();
            for (const s of statements) {
              const key = `${s.bank_name}|${s.account_number ?? 'NA'}`;
              if (!groups.has(key)) groups.set(key, { bank: s.bank_name, account: s.account_number ?? '-', firmName: s.firm_name, statements: [] });
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
                  <div key={key} className={`${isOpen ? 'card-button-pressed' : 'card-button'} ${needsAttention && !isOpen ? 'ring-1 ring-amber-200' : ''}`}>
                    {/* Account header */}
                    <div className="flex items-center justify-between px-6 py-4"
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
                            {!isSingleFirm && <span className="text-label-sm text-[var(--text-secondary)]">· {group.firmName}</span>}
                          </div>
                          <p className="text-label-sm text-[var(--text-secondary)] mt-0.5">
                            {totalStmts} statement{totalStmts !== 1 ? 's' : ''} · Latest balance: <span className="tabular-nums">{formatRM(latestBalance)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {/* GL Account mapping */}
                        {(() => {
                          const glMapping = bankGlMap[key];
                          const isEditing = glEditKey === key;
                          const groupFirmId = statements.find((s) => s.bank_name === group.bank && (s.account_number ?? '') === (group.account === '-' ? '' : group.account))?.firm_id ?? '';

                          if (isEditing) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <div className="min-w-[220px]">
                                  <GlAccountSelect
                                    value={glEditValue}
                                    onChange={setGlEditValue}
                                    accounts={glAccounts}
                                    firmId={groupFirmId}
                                    placeholder="Select GL..."
                                    preferredType="Asset"
                                    defaultType="Asset"
                                    onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                                  />
                                </div>
                                <button
                                  onClick={() => { if (glEditValue) saveBankGl(group.bank, group.account === '-' ? '' : group.account, glEditValue); }}
                                  disabled={!glEditValue}
                                  className="btn-thick-green text-xs px-2 py-1 font-medium disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setGlEditKey(null)}
                                  className="btn-thick-white text-xs px-2 py-1 font-medium"
                                >
                                  Cancel
                                </button>
                              </div>
                            );
                          }

                          return (
                            <button
                              onClick={() => {
                                if (glAccounts.length === 0) {
                                  window.dispatchEvent(new Event('highlight-firm-selector'));
                                  return;
                                }
                                setGlEditKey(key); setGlEditValue(glMapping?.gl_account_id ?? '');
                              }}
                              className={glMapping?.gl_account_id ? 'badge-blue' : 'badge-amber'}
                              title={glMapping?.gl_account_id ? 'Change GL account' : 'Assign GL account'}
                            >
                              {glMapping?.gl_account_label ?? 'No GL assigned'}
                            </button>
                          );
                        })()}

                        {needsAttention && (
                          <span className="badge-amber">{totalUnmatched} unmatched</span>
                        )}
                        {!needsAttention && (
                          <span className="badge-green">All reconciled</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded statement list */}
                    {isOpen && (
                      <table className="w-full ds-table-chassis">
                        <thead>
                          <tr className="ds-table-header">
                            <th className="px-6 py-2 text-left">Period</th>
                            <th className="px-4 py-2 text-right">Closing Balance</th>
                            <th className="px-4 py-2 text-center">Txns</th>
                            <th className="px-4 py-2 text-left">Progress</th>
                            <th className="px-4 py-2 text-center">Unmatched</th>
                            <th className="px-4 py-2 text-center">PDF</th>
                            <th className="px-3 py-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.statements.map((s, idx) => {
                            const resolved = s.matched + s.excluded;
                            const pct = s.total > 0 ? Math.round((resolved / s.total) * 100) : 0;
                            const isComplete = s.unmatched === 0;
                            return (
                              <tr key={s.id} onClick={() => router.push(`/accountant/bank-reconciliation/${s.id}`)}
                                className={`ds-table-row cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'} ${isComplete ? 'hover:bg-green-50/40' : 'hover:bg-amber-50/40'}`}>
                                <td data-col="Period" className="px-6 py-2.5">
                                  <p className="text-body-md font-medium text-[var(--text-primary)] tabular-nums">{formatDate(s.statement_date)}</p>
                                  {!isComplete && <p className="text-label-sm text-amber-600 font-medium">Needs attention</p>}
                                </td>
                                <td data-col="Closing Balance" className="px-4 py-2.5 text-body-md text-right tabular-nums text-[var(--text-primary)]">{formatRM(s.closing_balance)}</td>
                                <td data-col="Txns" className="px-4 py-2.5 text-body-md text-center text-[var(--text-secondary)] tabular-nums">{s.total}</td>
                                <td data-col="Progress" className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-[var(--surface-header)] overflow-hidden">
                                      <div className={`h-full ${isComplete ? 'bg-[var(--match-green)]' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-label-sm font-medium tabular-nums ${isComplete ? 'text-[var(--match-green)]' : 'text-amber-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td data-col="Unmatched" className="px-4 py-2.5 text-center">
                                  {s.unmatched > 0 ? <span className="text-body-sm font-semibold text-[var(--reject-red)] tabular-nums">{s.unmatched}</span> : <span className="text-body-sm text-[var(--match-green)] tabular-nums">0</span>}
                                </td>
                                <td data-col="PDF" className="px-4 py-2.5 text-center">
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

      {/* ═══ GL CHANGE CONFIRMATION MODAL ═══ */}
      {glConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4" onClick={() => setGlConfirm(null)}>
          <div className="bg-white shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)] uppercase tracking-widest mb-3">Change GL Account</h3>
            <div className="space-y-3 text-sm text-[var(--text-secondary)]">
              <p>You are changing the GL account for <strong>{glConfirm.bankName} {glConfirm.accountNumber}</strong>:</p>
              <div className="bg-[var(--surface-low)] p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest w-12">From</span>
                  <span className="font-medium">{glConfirm.oldLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest w-12">To</span>
                  <span className="font-medium">{glConfirm.newLabel}</span>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                Existing journal entries will not be affected. Please review your Journal Entries if any corrections are needed.
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => doSaveBankGl(glConfirm.bankName, glConfirm.accountNumber, glConfirm.glAccountId)}
                className="btn-thick-red flex-1 py-2.5 text-sm font-semibold"
              >
                Confirm Change
              </button>
              <button
                onClick={() => setGlConfirm(null)}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <BatchUploadOverlay
        active={uploading && !!batchProgress && !showUpload}
        label="Uploading statements..."
        current={batchProgress?.current ?? 0}
        total={batchProgress?.total ?? 0}
        onExpand={() => setShowUpload(true)}
        results={!uploading && batchProgress && !showUpload ? batchProgress.results : undefined}
        onDismiss={() => setBatchProgress(null)}
      />

    </div>
  );
}
