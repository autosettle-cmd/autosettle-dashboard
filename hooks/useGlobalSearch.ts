import { useState, useRef, useCallback } from 'react';

interface SearchResults {
  claims: any[];
  invoices: any[];
  transactions: any[];
  suppliers: any[];
  employees: any[];
}

const EMPTY: SearchResults = { claims: [], invoices: [], transactions: [], suppliers: [], employees: [] };

export function useGlobalSearch(firmId?: string) {
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(timerRef.current);
    abortRef.current?.abort();

    if (q.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim(), firmId }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!controller.signal.aborted) {
          setResults(json.data ?? EMPTY);
          setLoading(false);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setLoading(false);
      }
    }, 300);
  }, [firmId]);

  const clear = useCallback(() => {
    setQuery('');
    setResults(EMPTY);
    setLoading(false);
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const totalResults = results.claims.length + results.invoices.length + results.transactions.length + results.suppliers.length + results.employees.length;

  return { results, loading, query, search, clear, totalResults };
}
