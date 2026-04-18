'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

interface TaxCodeRow {
  id: string;
  code: string;
  description: string;
  rate: string;
  tax_type: string;
  glAccount: { account_code: string; name: string } | null;
  is_active: boolean;
}

export default function AdminTaxCodesPage() {
  usePageTitle('Tax Codes');
  const [taxCodes, setTaxCodes] = useState<TaxCodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/tax-codes')
      .then((r) => r.json())
      .then((j) => { setTaxCodes(j.data ?? []); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Tax Codes</h1>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture animate-in">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[var(--text-secondary)]">Loading...</div>
          ) : taxCodes.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Tax Codes</h3>
              <p className="text-sm text-[var(--text-secondary)]">Your accountant has not set up tax codes yet.</p>
            </div>
          ) : (
            <div className="bg-white overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      <th className="px-5 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Code</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right w-[80px]">Rate</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">GL Account</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] w-[80px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxCodes.map((tc, idx) => (
                      <tr key={tc.id} className={`text-body-sm hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td className="px-5 py-3 font-mono font-semibold text-[var(--text-primary)] tabular-nums">{tc.code}</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] font-medium">{tc.description}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[var(--text-primary)] font-semibold">{Number(tc.rate).toFixed(2)}%</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{tc.tax_type}</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] text-xs">
                          {tc.glAccount ? `${tc.glAccount.account_code} \u2014 ${tc.glAccount.name}` : '\u2014'}
                        </td>
                        <td className="px-3 py-3">
                          {tc.is_active
                            ? <span className="badge-green">Active</span>
                            : <span className="badge-gray">Inactive</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3">
                <p className="text-body-sm text-[var(--text-secondary)] tabular-nums">{taxCodes.length} tax codes</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
