'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  placeholder = 'Search GL Account...',
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

  // Search state
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate fixed position for dropdown so it escapes overflow containers
  const calculateDropPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const up = spaceBelow < 200 && spaceAbove > spaceBelow;
    setDropUp(up);
    setDropdownPos({
      top: up ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const lookup = allAccounts ?? accounts;

  // Get selected account for display
  const selectedAccount = accounts.find(a => a.id === value);

  // Filter and sort accounts
  const searchLower = search.toLowerCase();
  const filtered = accounts.filter(a => {
    if (!search) return true;
    return a.account_code.toLowerCase().includes(searchLower) ||
           a.name.toLowerCase().includes(searchLower);
  });

  // Sort: preferred type first, then by account_code
  const preferred = preferredType ? filtered.filter(a => a.account_type === preferredType) : [];
  const rest = preferredType ? filtered.filter(a => a.account_type !== preferredType) : filtered;
  const sortedFiltered = [...preferred, ...rest];

  // Infer parent from code as user types
  const inferredParent = newCode.trim() ? findParentByCode(newCode.trim(), lookup) : null;

  // Close dropdown when clicking outside (check both container and portal dropdown)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) &&
          dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [search]);

  const handleSelect = (account: GlAccount) => {
    onChange(account.id);
    setIsOpen(false);
    setSearch('');
  };

  const openDropdown = () => {
    calculateDropPosition();
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        openDropdown();
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, sortedFiltered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (sortedFiltered[highlightIndex]) {
          handleSelect(sortedFiltered[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearch('');
        break;
    }
  };

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
      setTimeout(() => onChange(created.id), 0);
      setShowAdd(false);
      setNewCode('');
      setNewName('');
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  };

  return (
    <div ref={containerRef} className="relative" style={{ marginBottom: '6px' }}>
      {/* Trigger — styled as physical keycap button matching action buttons */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => { if (!disabled) { openDropdown(); setTimeout(() => inputRef.current?.focus(), 0); } }}
          disabled={disabled}
          className={`btn-thick-navy w-full py-2.5 text-xs relative ${className}`}
        >
          <span className="truncate block pr-6">
            {selectedAccount ? `${selectedAccount.account_code} — ${selectedAccount.name}` : placeholder}
          </span>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className="btn-thick-navy w-full py-2.5 text-xs text-left pr-8 !text-white placeholder-white/60 !bg-[#1C3E5C]"
            style={{ caretColor: 'white', transform: 'translateY(4px)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)', borderTopColor: 'transparent', textShadow: 'none' }}
          />
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>
      )}

      {/* Dropdown — rendered via portal so it escapes overflow containers */}
      {isOpen && !disabled && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="bg-white border border-[#E0E3E5] max-h-60 overflow-y-auto"
          style={{
            position: 'fixed',
            zIndex: 9999,
            left: dropdownPos.left,
            width: dropdownPos.width,
            ...(dropUp
              ? { bottom: window.innerHeight - dropdownPos.top + 2 }
              : { top: dropdownPos.top }),
            boxShadow: '0 6px 16px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.08)',
          }}
        >
          {sortedFiltered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)]">No accounts found</div>
          ) : (
            <>
              {preferred.length > 0 && preferredType && (
                <div className="px-3 py-1.5 text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest bg-[var(--surface-low)] border-b border-[#E0E3E5]">
                  {preferredType}
                </div>
              )}
              {preferred.map((a, idx) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelect(a)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    highlightIndex === idx ? 'bg-[var(--primary)]/10 text-[var(--primary)]' :
                    a.id === value ? 'bg-[var(--surface-low)] font-medium' : 'hover:bg-[var(--surface-low)]'
                  }`}
                >
                  <span className="font-medium text-[var(--primary)]">{a.account_code}</span>
                  <span className="text-[var(--text-muted)]"> — </span>
                  <span className="text-[var(--text-primary)]">{a.name}</span>
                </button>
              ))}
              {preferred.length > 0 && rest.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest bg-[var(--surface-low)] border-y border-[#E0E3E5]">
                  Other
                </div>
              )}
              {rest.map((a, idx) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelect(a)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    highlightIndex === preferred.length + idx ? 'bg-[var(--primary)]/10 text-[var(--primary)]' :
                    a.id === value ? 'bg-[var(--surface-low)] font-medium' : 'hover:bg-[var(--surface-low)]'
                  }`}
                >
                  <span className="font-medium text-[var(--primary)]">{a.account_code}</span>
                  <span className="text-[var(--text-muted)]"> — </span>
                  <span className="text-[var(--text-primary)]">{a.name}</span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body
      )}

      {/* Add new account */}
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
                  className="input-recessed text-xs w-[130px]"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Account name"
                  className="input-recessed text-xs flex-1"
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
