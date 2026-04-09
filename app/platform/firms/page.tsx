'use client';

import { useState, useEffect } from 'react';
import PlatformSidebar from '@/components/PlatformSidebar';
import { usePageTitle } from '@/lib/use-page-title';

interface Firm {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  counts: { users: number; employees: number; claims: number; invoices: number; journalEntries: number; glAccounts: number; fiscalYears: number };
  accountants: { id: string; name: string; email: string }[];
}

interface Accountant { id: string; name: string; email: string; }

export default function PlatformFirmsPage() {
  usePageTitle('Firm Management');
  const [firms, setFirms] = useState<Firm[]>([]);
  const [accountants, setAccountants] = useState<Accountant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedFirm, setExpandedFirm] = useState<string | null>(null);

  // Create form
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newPostal, setNewPostal] = useState('');
  const [seedCoa, setSeedCoa] = useState(true);
  const [createFy, setCreateFy] = useState(true);
  const [fyYear, setFyYear] = useState(String(new Date().getFullYear()));
  const [selectedAccountants, setSelectedAccountants] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/platform/firms').then(r => r.json()),
      fetch('/api/platform/users?role=accountant').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([firmsRes, accountantsRes]) => {
      setFirms(firmsRes.data ?? []);
      setAccountants(accountantsRes.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/platform/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          address_line1: newAddress || null,
          city: newCity || null,
          state: newState || null,
          postal_code: newPostal || null,
          seedCoa,
          createFy,
          fyYear: createFy ? fyYear : null,
          accountantIds: selectedAccountants,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(''); setNewAddress(''); setNewCity(''); setNewState(''); setNewPostal('');
        setSelectedAccountants([]);
        loadData();
      }
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <PlatformSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h1 className="text-[22px] font-bold text-[#191C1E] tracking-tight">Firm Management</h1>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
            {showCreate ? 'Cancel' : '+ New Firm'}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 animate-in">

          {/* Create form */}
          {showCreate && (
            <div className="bg-white rounded-lg p-5 border border-gray-100 space-y-3">
              <h2 className="text-sm font-semibold text-[#191C1E]">Create New Firm</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="input-label">Company Name *</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} className="input-field w-full" placeholder="e.g. DS Plus Sdn Bhd" />
                </div>
                <div className="col-span-2">
                  <label className="input-label">Address</label>
                  <input value={newAddress} onChange={e => setNewAddress(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="input-label">City</label>
                  <input value={newCity} onChange={e => setNewCity(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="input-label">State</label>
                  <input value={newState} onChange={e => setNewState(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="input-label">Postal Code</label>
                  <input value={newPostal} onChange={e => setNewPostal(e.target.value)} className="input-field w-full" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-sm text-[#434654] cursor-pointer">
                  <input type="checkbox" checked={seedCoa} onChange={e => setSeedCoa(e.target.checked)} className="accent-blue-600" />
                  Seed default COA
                </label>
                <label className="flex items-center gap-1.5 text-sm text-[#434654] cursor-pointer">
                  <input type="checkbox" checked={createFy} onChange={e => setCreateFy(e.target.checked)} className="accent-blue-600" />
                  Create fiscal year
                </label>
                {createFy && (
                  <input type="number" value={fyYear} onChange={e => setFyYear(e.target.value)} className="input-field w-24" />
                )}
              </div>

              {accountants.length > 0 && (
                <div>
                  <label className="input-label">Assign Accountants</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {accountants.map(a => (
                      <label key={a.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                        selectedAccountants.includes(a.id) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-gray-200 text-[#434654] hover:bg-gray-50'
                      }`}>
                        <input
                          type="checkbox"
                          checked={selectedAccountants.includes(a.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedAccountants(prev => [...prev, a.id]);
                            else setSelectedAccountants(prev => prev.filter(id => id !== a.id));
                          }}
                          className="accent-blue-600"
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn-primary px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
                {creating ? 'Creating...' : 'Create Firm'}
              </button>
            </div>
          )}

          {/* Firms list */}
          {loading ? (
            <div className="text-center py-12 text-sm text-[#8E9196]">Loading...</div>
          ) : (
            <div className="bg-white rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-5 py-2.5">Firm</th>
                    <th className="px-3 py-2.5 w-[80px]">Status</th>
                    <th className="px-3 py-2.5 text-right w-[70px]">Users</th>
                    <th className="px-3 py-2.5 text-right w-[70px]">Claims</th>
                    <th className="px-3 py-2.5 text-right w-[80px]">Invoices</th>
                    <th className="px-3 py-2.5 text-right w-[60px]">JVs</th>
                    <th className="px-3 py-2.5 text-right w-[60px]">COA</th>
                    <th className="px-3 py-2.5 text-right w-[50px]">FYs</th>
                    <th className="px-3 py-2.5 w-[120px]">Accountants</th>
                  </tr>
                </thead>
                <tbody>
                  {firms.map(f => (
                    <tr
                      key={f.id}
                      className="border-b border-gray-50 hover:bg-[#F2F4F6] cursor-pointer transition-colors"
                      onClick={() => setExpandedFirm(expandedFirm === f.id ? null : f.id)}
                    >
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-[#191C1E]">{f.name}</p>
                        {expandedFirm === f.id && f.address_line1 && (
                          <p className="text-xs text-[#8E9196] mt-0.5">{[f.address_line1, f.city, f.state].filter(Boolean).join(', ')}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.users}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.claims}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.invoices}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.journalEntries}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.glAccounts}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#434654]">{f.counts.fiscalYears}</td>
                      <td className="px-3 py-2.5 text-[#8E9196] text-xs">
                        {f.accountants.map(a => a.name).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                  {firms.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-[#8E9196] text-sm">No firms yet. Create one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
