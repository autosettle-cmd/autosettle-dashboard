'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { formatRM } from '@/lib/formatters';
import { STATUS_CFG, APPROVAL_CFG } from '@/lib/badge-config';

function fmtDate(val: string | null) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

interface Props {
  open: boolean;
  onClose: () => void;
  role: 'admin' | 'accountant' | 'employee';
  firmId?: string;
}

export default function GlobalSearch({ open, onClose, role, firmId }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, query, search, clear, totalResults } = useGlobalSearch(firmId);
  const prefix = role === 'admin' ? '/admin' : role === 'employee' ? '/employee' : '/accountant';

  // Auto-focus on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else clear();
  }, [open, clear]);

  // Cmd+K / Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) onClose();
        else { /* parent handles opening */ }
      }
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const navigate = (path: string) => { onClose(); router.push(path); };

  const hasResults = totalResults > 0;

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[70] flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[70vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--surface-header)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search claims, invoices, transactions, suppliers..."
            className="flex-1 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />
          {loading && <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <kbd className="text-[10px] text-[var(--text-secondary)] bg-[var(--surface-low)] px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {query.length >= 2 && !loading && !hasResults && (
            <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No results found for &ldquo;{query}&rdquo;</div>
          )}

          {query.length < 2 && (
            <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Type at least 2 characters to search</div>
          )}

          {/* Claims */}
          {results.claims.length > 0 && (
            <Section title="Claims" count={results.claims.length} onViewAll={() => navigate(`${prefix}/claims?search=${encodeURIComponent(query)}`)}>
              {results.claims.slice(0, 5).map((c: any) => (
                <ResultRow key={c.id} onClick={() => navigate(`${prefix}/claims?preview=${c.id}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)] tabular-nums w-20 flex-shrink-0">{fmtDate(c.claim_date)}</span>
                      <span className="flex-1 min-w-0 truncate font-medium text-[var(--text-primary)]">{c.merchant || c.employee?.name}</span>
                      <span className="tabular-nums font-semibold text-[var(--text-primary)] w-24 text-right flex-shrink-0">{formatRM(c.amount)}</span>
                      <StatusBadge value={c.status} />
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 pl-[88px]">{c.employee?.name}{c.firm?.name ? ` · ${c.firm.name}` : ''}{c.category?.name ? ` · ${c.category.name}` : ''}</p>
                  </div>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* Invoices */}
          {results.invoices.length > 0 && (
            <Section title="Invoices" count={results.invoices.length} onViewAll={() => navigate(`${prefix}/invoices?search=${encodeURIComponent(query)}`)}>
              {results.invoices.slice(0, 5).map((inv: any) => (
                <ResultRow key={inv.id} onClick={() => navigate(`${prefix}/invoices?preview=${inv.id}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)] tabular-nums w-20 flex-shrink-0">{fmtDate(inv.issue_date)}</span>
                      <span className="flex-1 min-w-0 truncate font-medium text-[var(--text-primary)]">{inv.vendor_name_raw}</span>
                      <span className="text-[var(--text-secondary)] truncate w-28 flex-shrink-0">{inv.invoice_number || '-'}</span>
                      <span className="tabular-nums font-semibold text-[var(--text-primary)] w-24 text-right flex-shrink-0">{formatRM(inv.total_amount)}</span>
                      <StatusBadge value={inv.status} />
                    </div>
                    {inv.firm?.name && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 pl-[88px]">{inv.firm.name}</p>}
                  </div>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* Bank Transactions */}
          {results.transactions.length > 0 && (
            <Section title="Bank Transactions" count={results.transactions.length} onViewAll={() => navigate(`${prefix}/bank-reconciliation`)}>
              {results.transactions.slice(0, 5).map((txn: any) => (
                <ResultRow key={txn.id} onClick={() => navigate(`${prefix}/bank-reconciliation/${txn.bank_statement_id}?preview=${txn.id}`)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-secondary)] tabular-nums w-20 flex-shrink-0">{fmtDate(txn.transaction_date)}</span>
                      <span className="flex-1 min-w-0 truncate text-[var(--text-primary)]">{txn.description}</span>
                      {txn.debit ? (
                        <span className="tabular-nums font-semibold text-[var(--reject-red)] w-24 text-right flex-shrink-0">-{formatRM(txn.debit)}</span>
                      ) : (
                        <span className="tabular-nums font-semibold text-[var(--match-green)] w-24 text-right flex-shrink-0">+{formatRM(txn.credit)}</span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${txn.recon_status === 'unmatched' ? 'badge-amber' : 'badge-green'}`}>
                        {txn.recon_status === 'unmatched' ? 'Unmatched' : 'Matched'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 pl-[88px]">{txn.bankStatement?.bank_name} {txn.bankStatement?.account_number}{txn.bankStatement?.firm?.name ? ` · ${txn.bankStatement.firm.name}` : ''}</p>
                  </div>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* Suppliers */}
          {results.suppliers.length > 0 && (
            <Section title="Suppliers" count={results.suppliers.length} onViewAll={() => navigate(`${prefix}/suppliers?search=${encodeURIComponent(query)}`)}>
              {results.suppliers.slice(0, 5).map((s: any) => (
                <ResultRow key={s.id} onClick={() => navigate(`${prefix}/suppliers?preview=${s.id}`)}>
                  <span className="flex-1 min-w-0 truncate font-medium text-[var(--text-primary)]">{s.name}</span>
                  <span className="text-[var(--text-secondary)] text-xs">{s.firm?.name}</span>
                  <span className="text-[var(--text-secondary)] text-xs tabular-nums w-16 text-right flex-shrink-0">{s._count?.invoices ?? 0} inv</span>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* Employees */}
          {results.employees.length > 0 && (
            <Section title="Employees" count={results.employees.length} onViewAll={() => navigate(`${prefix}/employees?search=${encodeURIComponent(query)}`)}>
              {results.employees.slice(0, 5).map((emp: any) => (
                <ResultRow key={emp.id} onClick={() => navigate(`${prefix}/employees?preview=${emp.id}`)}>
                  <span className="flex-1 min-w-0 truncate font-medium text-[var(--text-primary)]">{emp.name}</span>
                  <span className="text-[var(--text-secondary)] text-xs truncate w-32">{emp.email || '-'}</span>
                  <span className="text-[var(--text-secondary)] text-xs tabular-nums">{emp.phone}</span>
                </ResultRow>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, onViewAll, children }: { title: string; count: number; onViewAll: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="ds-table-header flex items-center justify-between px-5 py-2">
        <span>{title} <span className="text-[var(--text-secondary)] font-normal ml-1">{count}</span></span>
        {count > 5 && (
          <button onClick={onViewAll} className="text-[10px] font-medium text-[var(--primary)] hover:underline normal-case tracking-normal">
            View all →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick} className="flex items-center gap-3 px-5 py-2.5 text-xs cursor-pointer hover:bg-[var(--surface-low)] transition-colors">
      {children}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const cfg = STATUS_CFG[value] ?? APPROVAL_CFG[value];
  if (!cfg) return null;
  return <span className={`${cfg.cls} flex-shrink-0`}>{cfg.label}</span>;
}
