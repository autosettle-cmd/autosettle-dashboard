'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

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
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number | null) {
  if (val === null) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankReconciliationPage() {
  const router = useRouter();

  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [reuploadId, setReuploadId] = useState<string | null>(null);

  const loadStatements = () => {
    fetch('/api/admin/bank-reconciliation/statements')
      .then((r) => r.json())
      .then((j) => { setStatements(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadStatements(); }, []);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const fd = new FormData();
    fd.append('file', file);
    if (pdfPassword) fd.append('password', pdfPassword);

    try {
      const res = await fetch('/api/admin/bank-reconciliation/upload', { method: 'POST', body: fd });
      if (!res.ok && !res.headers.get('content-type')?.includes('json')) {
        setUploadError(`Server error (${res.status}). Check console for details.`);
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

      if (json.error) {
        setUploadError(json.error);
        setUploading(false);
        return;
      }

      setUploading(false);
      setShowUpload(false);
      setNeedsPassword(false);
      setPdfPassword('');
      router.push(`/admin/bank-reconciliation/${json.data.statementId}`);
    } catch (e) {
      setUploadError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      setUploading(false);
    }
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
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Bank Reconciliation</h1>
          <button onClick={() => setShowUpload(true)} className="btn-primary px-3 py-1.5 bg-blue-600 text-white text-[13px] font-medium rounded-xl hover:bg-blue-700 transition-colors">
            Upload Statement
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {/* Upload modal */}
          {showUpload && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
              <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-semibold text-gray-900">Upload Bank Statement</h2>
                  <button onClick={() => setShowUpload(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium text-gray-500 mb-1 block">PDF File</label>
                    <input ref={fileRef} type="file" accept=".pdf" className="input-field w-full text-[13px]" onChange={() => { setNeedsPassword(false); setPdfPassword(''); setUploadError(''); }} />
                  </div>
                  {needsPassword && (
                    <div>
                      <label className="text-[12px] font-medium text-gray-500 mb-1 block">PDF Password</label>
                      <input type="password" value={pdfPassword} onChange={(e) => setPdfPassword(e.target.value)} placeholder="Enter PDF password" className="input-field w-full text-[13px]" autoFocus />
                    </div>
                  )}
                  {uploadError && <p className="text-[12px] text-red-600">{uploadError}</p>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowUpload(false)} className="flex-1 px-3 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                    <button onClick={handleUpload} disabled={uploading} className="btn-primary flex-1 px-3 py-2 text-[13px] text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
                      {uploading ? 'Processing...' : 'Upload & Parse'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hidden input for PDF re-upload */}
          <input ref={reuploadRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReuploadPdf(f); e.target.value = ''; }} />

          {loading ? (
            <div className="text-center text-sm text-gray-400 py-12">Loading...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">No bank statements uploaded yet</p>
              <p className="text-xs text-gray-300 mt-1">Upload a PDF bank statement to get started.</p>
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
                  <div key={key} className={`bg-white rounded-xl border overflow-hidden ${needsAttention ? 'border-amber-200' : 'border-gray-100'}`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }}>
                    <div className={`flex items-center justify-between px-6 py-3.5 cursor-pointer transition-colors ${isOpen ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                      onClick={() => setExpandedAccount(isOpen ? null : key)}>
                      <div className="flex items-center gap-3">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[14px] font-semibold text-gray-900">{group.bank}</p>
                            <span className="text-[13px] text-gray-500 tabular-nums">{group.account}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {totalStmts} statement{totalStmts !== 1 ? 's' : ''} · Latest balance: {formatRM(latestBalance)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {needsAttention ? (
                          <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{totalUnmatched} unmatched</span>
                        ) : (
                          <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">All reconciled</span>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-b border-gray-100 bg-gray-50/50">
                            <th className="px-6 py-2 text-left">Period</th>
                            <th className="px-6 py-2 text-right">Closing Balance</th>
                            <th className="px-6 py-2 text-center">Txns</th>
                            <th className="px-6 py-2 text-left">Progress</th>
                            <th className="px-6 py-2 text-center">Unmatched</th>
                            <th className="px-6 py-2 text-center">PDF</th>
                            <th className="px-3 py-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.statements.map((s) => {
                            const resolved = s.matched + s.excluded;
                            const pct = s.total > 0 ? Math.round((resolved / s.total) * 100) : 0;
                            const isComplete = s.unmatched === 0;
                            return (
                              <tr key={s.id} onClick={() => router.push(`/admin/bank-reconciliation/${s.id}`)}
                                className={`group transition-colors cursor-pointer border-b border-gray-50 ${isComplete ? 'hover:bg-green-50/40' : 'hover:bg-amber-50/40 bg-amber-50/20'}`}>
                                <td className="px-6 py-2.5">
                                  <p className="text-[13px] font-medium text-gray-900">{formatDate(s.statement_date)}</p>
                                  {!isComplete && <p className="text-[10px] text-amber-600 font-medium">Needs attention</p>}
                                </td>
                                <td className="px-6 py-2.5 text-[13px] text-right tabular-nums text-gray-900">{formatRM(s.closing_balance)}</td>
                                <td className="px-6 py-2.5 text-[13px] text-center text-gray-700">{s.total}</td>
                                <td className="px-6 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-[11px] font-medium tabular-nums ${isComplete ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  {s.unmatched > 0 ? <span className="text-[12px] font-semibold text-red-600">{s.unmatched}</span> : <span className="text-[12px] text-green-600">0</span>}
                                </td>
                                <td className="px-6 py-2.5 text-center">
                                  {s.file_url ? (
                                    <a href={s.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors" title="Download PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      PDF
                                    </a>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setReuploadId(s.id); reuploadRef.current?.click(); }}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors" title="Re-upload PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                      </svg>
                                      Upload
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteStatement(s.id); }}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete statement">
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
