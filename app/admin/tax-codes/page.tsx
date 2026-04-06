'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';

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
  const [taxCodes, setTaxCodes] = useState<TaxCodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/tax-codes')
      .then((r) => r.json())
      .then((j) => { setTaxCodes(j.data ?? []); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6F8]">
      <Sidebar role="admin" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Tax Codes</h1>
        </header>

        <main className="flex-1 overflow-auto p-6 space-y-6 animate-in">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
          ) : taxCodes.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center">
              <h3 className="text-base font-semibold text-[#191C1E] mb-1">No Tax Codes</h3>
              <p className="text-sm text-[#8E9196]">Your accountant has not set up tax codes yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Description</th>
                      <th className="px-3 py-2.5 text-right w-[80px]">Rate</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">GL Account</th>
                      <th className="px-3 py-2.5 w-[80px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxCodes.map((tc) => (
                      <tr key={tc.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors border-b border-gray-50">
                        <td className="px-5 py-3 font-mono font-semibold text-[#191C1E]">{tc.code}</td>
                        <td className="px-3 py-3 text-[#434654] font-medium">{tc.description}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#191C1E] font-semibold">{Number(tc.rate).toFixed(2)}%</td>
                        <td className="px-3 py-3 text-[#8E9196]">{tc.tax_type}</td>
                        <td className="px-3 py-3 text-[#434654] text-xs">
                          {tc.glAccount ? `${tc.glAccount.account_code} — ${tc.glAccount.name}` : '—'}
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
              <div className="px-5 py-3 border-t border-gray-100">
                <p className="text-body-sm text-[#8E9196]">{taxCodes.length} tax codes</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
