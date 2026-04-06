import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

export function useTableSort<T>(items: T[], defaultField: string, defaultDir: SortDir = 'desc') {
  const [sortField, setSortField] = useState(defaultField);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortField) return items;
    return [...items].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = (a as any)[sortField];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vb = (b as any)[sortField];

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      let cmp: number;
      // Date strings (ISO format)
      if (typeof va === 'string' && /^\d{4}-\d{2}-\d{2}/.test(va)) {
        cmp = new Date(va).getTime() - new Date(vb).getTime();
      }
      // Numeric strings or numbers
      else if (!isNaN(Number(va)) && !isNaN(Number(vb)) && va !== '' && vb !== '') {
        cmp = Number(va) - Number(vb);
      }
      // Strings
      else {
        cmp = String(va).localeCompare(String(vb), 'en', { sensitivity: 'base' });
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortField, sortDir]);

  const sortIndicator = (field: string) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return { sorted, sortField, sortDir, toggleSort, sortIndicator };
}
