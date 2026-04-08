'use client';

import { useState } from 'react';

interface GlAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
  normal_balance?: string;
  parent_id?: string | null;
}

interface GlAccountSelectProps {
  value: string;
  onChange: (id: string) => void;
  accounts: GlAccount[];
  /** All accounts in the firm (for parent lookup). Falls back to `accounts` if not provided. */
  allAccounts?: GlAccount[];
  onAccountCreated?: (account: GlAccount) => void;
  firmId?: string;
  placeholder?: string;
  /** Account types to show first (e.g. 'Expense', 'Revenue', 'Liability', 'Asset') */
  preferredType?: string;
  /** Fallback account_type + normal_balance if no parent can be inferred */
  defaultType?: string;
  defaultBalance?: 'Debit' | 'Credit';
  disabled?: boolean;
  className?: string;
}

/**
 * Find the best parent account by matching the code prefix.
 * E.g. code "111-001" → looks for "111-000", "111-00", "111-0", "111" in order.
 */
function findParentByCode(code: string, allAccounts: GlAccount[]): GlAccount | null {
  const parts = code.split('-');
  if (parts.length < 2) return null;
  // Try progressively shorter prefixes
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('-');
    // Try prefix-000 first (common pattern), then prefix alone
    const withZeros = `${prefix}-${'0'.repeat(parts[i]?.length || 3)}`;
    const matchZeros = allAccounts.find(a => a.account_code === withZeros);
    if (matchZeros) return matchZeros;
    const matchPrefix = allAccounts.find(a => a.account_code === prefix);
    if (matchPrefix) return matchPrefix;
  }
  return null;
}

const NORMAL_BALANCE: Record<string, string> = {
  Asset: 'Debit', Expense: 'Debit',
  Liability: 'Credit', Equity: 'Credit', Revenue: 'Credit',
};

export default function GlAccountSelect({
  value,
  onChange,
  accounts,
  allAccounts,
  onAccountCreated,
  firmId,
  placeholder = 'Select GL Account',
  preferredType,
  defaultType,
  defaultBalance,
  disabled,
  className = '',
}: GlAccountSelectProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const preferred = preferredType ? accounts.filter(a => a.account_type === preferredType) : [];
  const rest = preferredType ? accounts.filter(a => a.account_type !== preferredType) : accounts;
  const lookup = allAccounts ?? accounts;

  // Infer parent from code as user types
  const inferredParent = newCode.trim() ? findParentByCode(newCode.trim(), lookup) : null;

  const createAccount = async () => {
    if (!newCode.trim() || !newName.trim() || !firmId) return;
    setCreating(true);
    setError('');

    const accountType = inferredParent?.account_type || defaultType || preferredType || 'Expense';
    const normalBalance = defaultBalance || NORMAL_BALANCE[accountType] || 'Debit';

    try {
      const res = await fetch('/api/gl-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmId,
          account_code: newCode.trim(),
          name: newName.trim(),
          account_type: accountType,
          normal_balance: normalBalance,
          parent_id: inferredParent?.id ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Failed to create'); return; }
      const created = j.data as GlAccount;
      onAccountCreated?.(created);
      onChange(created.id);
      setShowAdd(false);
      setNewCode('');
      setNewName('');
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`input-field w-full text-sm ${className}`}
      >
        <option value="">{placeholder}</option>
        {preferred.map(a => (
          <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
        ))}
        {preferredType && rest.length > 0 && <option disabled>──────────</option>}
        {rest.map(a => (
          <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
        ))}
      </select>
      {firmId && !disabled && (
        <>
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-1 text-xs font-medium hover:underline transition-colors"
              style={{ color: 'var(--primary)' }}
            >
              + Add new account
            </button>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code (e.g. 111-001)"
                  className="input-field text-xs w-[130px]"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Account name"
                  className="input-field text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === 'Enter') createAccount(); }}
                />
                <button
                  type="button"
                  onClick={createAccount}
                  disabled={creating || !newCode.trim() || !newName.trim()}
                  className="text-label-sm px-2.5 py-1.5 rounded-lg font-medium text-white btn-blue transition-all duration-200 disabled:opacity-40"
                >
                  {creating ? '...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setNewCode(''); setNewName(''); setError(''); }}
                  className="text-[#8E9196] hover:text-[#434654] text-xs"
                >
                  Cancel
                </button>
              </div>
              {inferredParent && (
                <p className="text-xs text-[#8E9196]">
                  Parent: <span className="font-medium text-[#434654]">{inferredParent.account_code} — {inferredParent.name}</span>
                  <span className="ml-1.5">({inferredParent.account_type})</span>
                </p>
              )}
              {newCode.trim() && !inferredParent && (
                <p className="text-xs text-amber-600">No parent found — will be created at root level</p>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </>
      )}
    </div>
  );
}
