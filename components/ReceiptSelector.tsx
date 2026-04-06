'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface ReceiptItem {
  id: string;
  receipt_number: string | null;
  merchant: string;
  amount: string;
  claim_date: string;
  thumbnail_url: string | null;
  file_url: string | null;
}

interface ReceiptSelectorProps {
  firmId?: string;
  apiBasePath: string;
  invoiceBalances?: number[];  // unpaid invoice balances for fuzzy amount matching
  selectedIds: string[];
  onSelectionChange: (ids: string[], totalAmount: number) => void;
  onPreview: (receipt: { id: string; merchant: string; receipt_number: string | null; amount: string; thumbnail_url: string | null; file_url: string | null }) => void;
}

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear().toString().slice(-2),
  ].join('/');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Returns the smallest absolute difference between a receipt amount and any invoice balance
function closestMatchDistance(receiptAmount: number, invoiceBalances: number[]): number {
  if (invoiceBalances.length === 0) return Infinity;
  return Math.min(...invoiceBalances.map(b => Math.abs(receiptAmount - b)));
}

export default function ReceiptSelector({
  firmId,
  apiBasePath,
  invoiceBalances = [],
  selectedIds,
  onSelectionChange,
  onPreview,
}: ReceiptSelectorProps) {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [selectedReceipts, setSelectedReceipts] = useState<ReceiptItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReceipts = useCallback(async (searchTerm: string) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (searchTerm) p.set('search', searchTerm);
    if (firmId) p.set('firmId', firmId);
    p.set('limit', '50');

    try {
      const res = await fetch(`${apiBasePath}/unlinked?${p}`);
      const j = await res.json();
      setReceipts(j.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiBasePath, firmId]);

  useEffect(() => { fetchReceipts(''); }, [fetchReceipts]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchReceipts(search); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchReceipts]);

  const toggle = (receipt: ReceiptItem) => {
    const isSelected = selectedIds.includes(receipt.id);
    let nextIds: string[];
    let nextSelected: ReceiptItem[];

    if (isSelected) {
      nextIds = selectedIds.filter(id => id !== receipt.id);
      nextSelected = selectedReceipts.filter(r => r.id !== receipt.id);
    } else {
      nextIds = [...selectedIds, receipt.id];
      nextSelected = [...selectedReceipts, receipt];
    }

    setSelectedReceipts(nextSelected);
    const total = nextSelected.reduce((sum, r) => sum + Number(r.amount), 0);
    onSelectionChange(nextIds, total);
  };

  const remove = (id: string) => {
    const nextIds = selectedIds.filter(rid => rid !== id);
    const nextSelected = selectedReceipts.filter(r => r.id !== id);
    setSelectedReceipts(nextSelected);
    const total = nextSelected.reduce((sum, r) => sum + Number(r.amount), 0);
    onSelectionChange(nextIds, total);
  };

  // Sort unselected receipts: closest amount match to any invoice balance first
  const sortedUnselected = useMemo(() => {
    const unselected = receipts.filter(r => !selectedIds.includes(r.id));
    if (invoiceBalances.length === 0) return unselected;
    return [...unselected].sort((a, b) => {
      const distA = closestMatchDistance(Number(a.amount), invoiceBalances);
      const distB = closestMatchDistance(Number(b.amount), invoiceBalances);
      return distA - distB;
    });
  }, [receipts, selectedIds, invoiceBalances]);

  // Check if a receipt is an exact match (within 0.01) to any invoice balance
  const isExactMatch = (amount: number) =>
    invoiceBalances.some(b => Math.abs(amount - b) < 0.01);

  return (
    <div>
      <h3 className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-2">
        Attach Receipts (optional)
      </h3>

      {/* Selected chips */}
      {selectedReceipts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedReceipts.map(r => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-label-sm text-blue-700"
            >
              <span className="font-medium truncate max-w-[120px]">
                {r.receipt_number || r.merchant}
              </span>
              <span className="tabular-nums">{formatRM(r.amount)}</span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="ml-0.5 text-blue-400 hover:text-blue-600 leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative mb-1.5">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8E9196]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search receipt no, merchant, amount..."
          className="input-field w-full pl-8 py-1.5 text-body-sm"
        />
      </div>

      {/* Receipt list */}
      <div className="max-h-[240px] overflow-y-auto border border-gray-200 rounded-lg">
        {loading ? (
          <div className="px-3 py-4 text-center text-body-sm text-[#8E9196]">Loading...</div>
        ) : sortedUnselected.length === 0 && selectedReceipts.length === 0 ? (
          <div className="px-3 py-4 text-center text-body-sm text-[#8E9196]">No unlinked receipts found</div>
        ) : sortedUnselected.length === 0 && search ? (
          <div className="px-3 py-4 text-center text-body-sm text-[#8E9196]">No results for &ldquo;{search}&rdquo;</div>
        ) : (
          <div>
            {sortedUnselected.map(r => {
              const exact = isExactMatch(Number(r.amount));
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-100 last:border-b-0 ${exact ? 'bg-green-50/50' : ''}`}
                  onClick={() => toggle(r)}
                >
                  {/* Checkbox */}
                  <div className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center">
                    {selectedIds.includes(r.id) && (
                      <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                    )}
                  </div>

                  {/* Receipt info */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-body-sm font-medium text-[#191C1E] truncate max-w-[140px]">
                      {r.receipt_number || r.merchant}
                    </span>
                    {r.receipt_number && (
                      <span className="text-label-sm text-[#8E9196] truncate max-w-[80px]">
                        {r.merchant}
                      </span>
                    )}
                    {exact && (
                      <span className="text-label-sm font-medium text-green-600 flex-shrink-0">Match</span>
                    )}
                  </div>

                  {/* Amount */}
                  <span className={`text-body-sm font-semibold tabular-nums flex-shrink-0 ${exact ? 'text-green-700' : 'text-[#191C1E]'}`}>
                    {formatRM(r.amount)}
                  </span>

                  {/* Date */}
                  <span className="text-label-sm text-[#8E9196] tabular-nums flex-shrink-0 w-[52px] text-right">
                    {formatDate(r.claim_date)}
                  </span>

                  {/* Preview button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview({
                        id: r.id,
                        merchant: r.merchant,
                        receipt_number: r.receipt_number,
                        amount: r.amount,
                        thumbnail_url: r.thumbnail_url,
                        file_url: r.file_url,
                      });
                    }}
                    className="flex-shrink-0 text-[#8E9196] hover:text-[#434654] transition-colors"
                    title="Preview receipt"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
