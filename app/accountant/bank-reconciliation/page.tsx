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
  firm_name: string;
  firm_id: string;
  created_at: string;
  total: number;
  matched: number;
  unmatched: number;
  excluded: number;
}

interface FirmOption { id: string; name: string; }

function formatDate(val: string) {
  const d = new Date(val);
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number | null) {
  if (val === null) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountantBankReconciliationPage() {
  const router = useRouter();

  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmFilter, setFirmFilter] = useState('');
  const [uploadFirmId, setUploadFirmId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/firms').then((r) => r.json()).then((j) => {
      const list = j.data ?? [];
      setFirms(list);
      // Auto-select if single firm (in-house accountant)
      if (list.length === 1) {
        setFirmFilter(list[0].id);
        setUploadFirmId(list[0].id);
      }
    }).catch(console.error);
  }, []);

  const isSingleFirm = firms.length === 1;

  const loadStatements = () => {
    const params = new URLSearchParams();
    if (firmFilter) params.set('firmId', firmFilter);
    fetch(`/api/bank-reconciliation/statements?${params}`)
      .then((r) => r.json())
      .then((j) => { setStatements(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { setLoading(true); loadStatements(); }, [firmFilter]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadFirmId) return;

    setUploading(true);
    setUploadError('');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('firm_id', uploadFirmId);

    try {
      const res = await fetch('/api/bank-reconciliation/upload', { method: 'POST', body: fd });
      if (!res.ok && !res.headers.get('content-type')?.includes('json')) {
        setUploadError(`Server error (${res.status}).`);
        setUploading(false);
        return;
      }
      const json = await res.json();
      if (json.error) { setUploadError(json.error); setUploading(false); return; }
      setUploading(false);
      setShowUpload(false);
      router.push(`/accountant/bank-reconciliation/${json.data.statementId}`);
    } catch (e) {
      setUploadError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      setUploading(false);
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Bank Reconciliation</h1>
          <div className="flex items-center gap-3">
            {!isSingleFirm && (
              <select value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)} className="input-field text-[13px]">
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 btn-primary text-[13px] font-medium rounded-xl">
              Upload Statement
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {showUpload && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
              <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-[15px] font-semibold text-gray-900 mb-4">Upload Bank Statement</h2>
                <div className="space-y-3">
                  {!isSingleFirm && (
                  <div>
                    <label className="text-[12px] font-medium text-gray-500 mb-1 block">Client Firm</label>
                    <select value={uploadFirmId} onChange={(e) => setUploadFirmId(e.target.value)} className="input-field w-full text-[13px]">
                      <option value="">Select firm...</option>
                      {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  )}
                  <div>
                    <label className="text-[12px] font-medium text-gray-500 mb-1 block">PDF File</label>
                    <input ref={fileRef} type="file" accept=".pdf" className="input-field w-full text-[13px]" />
                  </div>
                  {uploadError && <p className="text-[12px] text-red-600">{uploadError}</p>}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowUpload(false)} className="flex-1 px-3 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                    <button onClick={handleUpload} disabled={uploading || !uploadFirmId} className="flex-1 px-3 py-2 text-[13px] btn-primary rounded-xl disabled:opacity-50">
                      {uploading ? 'Processing...' : 'Upload & Parse'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-gray-400 py-12">Loading...</div>
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">No bank statements uploaded yet</p>
              <p className="text-xs text-gray-300 mt-1">Upload a PDF bank statement to get started.</p>
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
                  <div key={key} className={`bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden ${needsAttention ? 'border-amber-200' : 'border-gray-100'}`}>
                    {/* Account header */}
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
                            {!isSingleFirm && <span className="text-[11px] text-gray-400">· {group.firmName}</span>}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {totalStmts} statement{totalStmts !== 1 ? 's' : ''} · Latest balance: {formatRM(latestBalance)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {needsAttention && (
                          <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{totalUnmatched} unmatched</span>
                        )}
                        {!needsAttention && (
                          <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">All reconciled</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded statement list */}
                    {isOpen && (
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-b border-gray-100 bg-gray-50/50">
                            <th className="px-6 py-2 text-left">Period</th>
                            <th className="px-4 py-2 text-right">Closing Balance</th>
                            <th className="px-4 py-2 text-center">Txns</th>
                            <th className="px-4 py-2 text-left">Progress</th>
                            <th className="px-4 py-2 text-center">Unmatched</th>
                            <th className="px-4 py-2 text-center">PDF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.statements.map((s) => {
                            const resolved = s.matched + s.excluded;
                            const pct = s.total > 0 ? Math.round((resolved / s.total) * 100) : 0;
                            const isComplete = s.unmatched === 0;
                            return (
                              <tr key={s.id} onClick={() => router.push(`/accountant/bank-reconciliation/${s.id}`)}
                                className={`group transition-colors cursor-pointer border-b border-gray-50 ${isComplete ? 'hover:bg-green-50/40' : 'hover:bg-amber-50/40 bg-amber-50/20'}`}>
                                <td className="px-6 py-2.5">
                                  <p className="text-[13px] font-medium text-gray-900">{formatDate(s.statement_date)}</p>
                                  {!isComplete && <p className="text-[10px] text-amber-600 font-medium">Needs attention</p>}
                                </td>
                                <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-gray-900">{formatRM(s.closing_balance)}</td>
                                <td className="px-4 py-2.5 text-[13px] text-center text-gray-700">{s.total}</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-[11px] font-medium tabular-nums ${isComplete ? 'text-green-600' : 'text-amber-600'}`}>{pct}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {s.unmatched > 0 ? <span className="text-[12px] font-semibold text-red-600">{s.unmatched}</span> : <span className="text-[12px] text-green-600">0</span>}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {s.file_url ? (
                                    <a href={s.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors" title="Download PDF">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      PDF
                                    </a>
                                  ) : <span className="text-gray-300 text-[11px]">—</span>}
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
