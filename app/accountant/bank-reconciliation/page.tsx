'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';
import GlAccountSelect from '@/components/GlAccountSelect';
import { useFirm } from '@/contexts/FirmContext';

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
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number | null) {
  if (val === null) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    // Get unique firm IDs from statements
    const firmIdArr = Array.from(new Set(statements.map((s) => s.firm_id)));
    const firmId = firmIdArr.length === 1 ? firmIdArr[0] : firmFilter;
    if (!firmId) return;

    Promise.all([
      fetch(`/api/gl-accounts?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/accounting-settings?firmId=${firmId}`).then((r) => r.json()),
    ]).then(([glJson, settingsJson]) => {
      setGlAccounts(glJson.data ?? []);
      const mappings: Record<string, { gl_account_id: string | null; gl_account_label: string | null }> = {};
      for (const m of settingsJson.data?.bank_mappings ?? []) {
        mappings[`${m.bank_name}|${m.account_number}`] = { gl_account_id: m.gl_account_id, gl_account_label: m.gl_account_label };
      }
      setBankGlMap(mappings);
    }).catch(console.error);
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

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0 || !uploadFirmId) return;

    setUploading(true);
    setUploadError('');

    // Single file — original flow (supports password prompt)
    if (files.length === 1) {
      const fd = new FormData();
      fd.append('file', files[0]);
      fd.append('firm_id', uploadFirmId);
      if (pdfPassword) fd.append('password', pdfPassword);

      try {
        const res = await fetch('/api/bank-reconciliation/upload', { method: 'POST', body: fd });
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
        router.push(`/accountant/bank-reconciliation/${d.statementId}`);
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
      const file = fileList[i];
      setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('firm_id', uploadFirmId);

        const res = await fetch('/api/bank-reconciliation/upload', { method: 'POST', body: fd });
        const json = await res.json();

        if (json.error) {
          results.push({ name: file.name, ok: false, msg: json.error });
        } else {
          const d = json.data;
          const warnings = [];
          if (d.warning) warnings.push('Gemini fallback');
          if (d.skippedDuplicates > 0) warnings.push(`${d.skippedDuplicates} dupes skipped`);
          results.push({ name: file.name, ok: true, msg: `${d.transactionCount} transactions${warnings.length ? ' (' + warnings.join(', ') + ')' : ''}` });
        }
      } catch (e) {
        results.push({ name: file.name, ok: false, msg: e instanceof Error ? e.message : 'Failed' });
      }

      setBatchProgress({ current: i + 1, total: fileList.length, results: [...results] });
    }

    setUploading(false);
    // Refresh statements list after batch
    loadStatements();
  };

  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('Delete this bank statement and all its transactions? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/bank-reconciliation/statements/delete', {
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
      setShowUpload(true);
      alert('Please select a firm first, then drag files again.');
      return;
    }

    // Start batch upload directly
    setUploading(true);
    setUploadError('');
    const results: { name: string; ok: boolean; msg: string }[] = [];
    setBatchProgress({ current: 0, total: files.length, results });
    setShowUpload(true);
    setUploadFirmId(targetFirmId);

    for (let i = 0; i < files.length; i++) {
      setBatchProgress({ current: i + 1, total: files.length, results: [...results] });
      try {
        const fd = new FormData();
        fd.append('file', files[i]);
        fd.append('firm_id', targetFirmId);
        const res = await fetch('/api/bank-reconciliation/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.error) {
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
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
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
          <div className="absolute inset-0 z-50 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg px-8 py-6 text-center">
              <svg className="w-10 h-10 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[#191C1E]">Drop PDF files to upload</p>
              <p className="text-xs text-[#8E9196] mt-1">Bank statements will be parsed automatically</p>
            </div>
          </div>
        )}

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Bank Reconciliation</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 btn-primary text-body-md font-medium rounded-lg">
              Upload Statement
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {showUpload && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
              <div className="bg-white rounded-lg shadow-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-title-md font-semibold text-[#191C1E] mb-4">Upload Bank Statement</h2>
                <div className="space-y-3">
                  {!isSingleFirm && (
                  <div>
                    <label className="text-body-sm font-medium text-[#434654] mb-1 block">Client Firm</label>
                    <select value={uploadFirmId} onChange={(e) => setUploadFirmId(e.target.value)} className="input-field w-full text-body-md">
                      <option value="">Select firm...</option>
                      {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  )}
                  <div>
                    <label className="text-body-sm font-medium text-[#434654] mb-1 block">PDF File</label>
                    <input ref={fileRef} type="file" accept=".pdf" multiple className="input-field w-full text-body-md" onChange={() => { setNeedsPassword(false); setPdfPassword(''); setUploadError(''); setBatchProgress(null); }} />
                  </div>
                  {needsPassword && (
                    <div>
                      <label className="text-body-sm font-medium text-[#434654] mb-1 block">PDF Password</label>
                      <input type="password" value={pdfPassword} onChange={(e) => setPdfPassword(e.target.value)} placeholder="Enter PDF password" className="input-field w-full text-body-md" autoFocus />
                    </div>
                  )}
                  {uploadError && <p className="text-body-sm text-red-600">{uploadError}</p>}

                  {/* Batch progress */}
                  {batchProgress && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#8E9196]">
                        <span>Processing {batchProgress.current} of {batchProgress.total}</span>
                        <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                      </div>
                      {batchProgress.results.length > 0 && (
                        <div className="max-h-[200px] overflow-y-auto space-y-1">
                          {batchProgress.results.map((r, i) => (
                            <div key={i} className={`text-xs px-2 py-1 rounded ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              <span className="font-medium">{r.name}</span>: {r.msg}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => { setShowUpload(false); setBatchProgress(null); }} className="flex-1 px-3 py-2 text-body-md text-[#434654] border border-gray-200 rounded-lg hover:bg-gray-50">
                      {batchProgress && !uploading ? 'Done' : 'Cancel'}
                    </button>
                    {!batchProgress && (
                      <button onClick={handleUpload} disabled={uploading || !uploadFirmId} className="flex-1 px-3 py-2 text-body-md btn-primary rounded-lg disabled:opacity-50">
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
            <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[#8E9196]">No bank statements uploaded yet</p>
              <p className="text-xs text-[#8E9196] mt-1">Upload a PDF bank statement to get started.</p>
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
                  <div key={key} className={`bg-white rounded-lg border ${needsAttention ? 'border-amber-200' : 'border-gray-100'}`}>
                    {/* Account header */}
                    <div className={`flex items-center justify-between px-6 py-3.5 cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                      onClick={() => setExpandedAccount(isOpen ? null : key)}>
                      <div className="flex items-center gap-3">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-[#8E9196] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-title-sm font-semibold text-[#191C1E]">{group.bank}</p>
                            <span className="text-body-md text-[#434654] tabular-nums">{group.account}</span>
                            {!isSingleFirm && <span className="text-label-sm text-[#8E9196]">· {group.firmName}</span>}
                          </div>
                          <p className="text-label-sm text-[#8E9196] mt-0.5">
                            {totalStmts} statement{totalStmts !== 1 ? 's' : ''} · Latest balance: {formatRM(latestBalance)}
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
                                  className="text-xs px-2 py-1 rounded font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setGlEditKey(null)}
                                  className="text-xs px-2 py-1 rounded font-medium text-[#434654] border border-gray-200 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            );
                          }

                          return (
                            <button
                              onClick={() => { setGlEditKey(key); setGlEditValue(glMapping?.gl_account_id ?? ''); }}
                              className={`text-label-sm font-medium px-2.5 py-1 rounded transition-colors ${
                                glMapping?.gl_account_id
                                  ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                                  : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              }`}
                              title={glMapping?.gl_account_id ? 'Change GL account' : 'Assign GL account'}
                            >
                              {glMapping?.gl_account_label ?? 'No GL assigned'}
                            </button>
                          );
                        })()}

                        {needsAttention && (
                          <span className="text-label-sm font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{totalUnmatched} unmatched</span>
                        )}
                        {!needsAttention && (
                          <span className="text-label-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">All reconciled</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded statement list */}
                    {isOpen && (
                      <table className="w-full">
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
                          {group.statements.map((s) => {
                            const resolved = s.matched + s.excluded;
                            const pct = s.total > 0 ? Math.round((resolved / s.total) * 100) : 0;
                            const isComplete = s.unmatched === 0;
                            return (
                              <tr key={s.id} onClick={() => router.push(`/accountant/bank-reconciliation/${s.id}`)}
                                className={`group transition-colors cursor-pointer ${isComplete ? 'hover:bg-green-50/40' : 'hover:bg-amber-50/40 bg-amber-50/20'}`}>
                                <td className="px-6 py-2.5">
                                  <p className="text-body-md font-medium text-[#191C1E]">{formatDate(s.statement_date)}</p>
                                  {!isComplete && <p className="text-label-sm text-amber-600 font-medium">Needs attention</p>}
                                </td>
                                <td className="px-4 py-2.5 text-body-md text-right tabular-nums text-[#191C1E]">{formatRM(s.closing_balance)}</td>
                                <td className="px-4 py-2.5 text-body-md text-center text-[#434654]">{s.total}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-label-sm font-medium tabular-nums ${isComplete ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {s.unmatched > 0 ? <span className="text-body-sm font-semibold text-red-600">{s.unmatched}</span> : <span className="text-body-sm text-green-600">0</span>}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {s.file_url ? (
                                    <a href={s.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-label-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors" title="Download PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      PDF
                                    </a>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setReuploadId(s.id); reuploadRef.current?.click(); }}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-label-sm font-medium text-[#434654] border border-gray-200 rounded hover:bg-gray-50 transition-colors" title="Re-upload PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                      </svg>
                                      Upload
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteStatement(s.id); }}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8E9196] hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete statement">
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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setGlConfirm(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#191C1E] mb-3">Change GL Account</h3>
            <div className="space-y-3 text-sm text-[#434654]">
              <p>You are changing the GL account for <strong>{glConfirm.bankName} {glConfirm.accountNumber}</strong>:</p>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[#8E9196] text-xs font-medium uppercase w-12">From</span>
                  <span className="font-medium">{glConfirm.oldLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#8E9196] text-xs font-medium uppercase w-12">To</span>
                  <span className="font-medium">{glConfirm.newLabel}</span>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                Existing journal entries will not be affected. Please review your Journal Entries if any corrections are needed.
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => doSaveBankGl(glConfirm.bankName, glConfirm.accountNumber, glConfirm.glAccountId)}
                className="btn-reject flex-1 py-2.5 rounded-lg text-sm font-semibold"
              >
                Confirm Change
              </button>
              <button
                onClick={() => setGlConfirm(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
