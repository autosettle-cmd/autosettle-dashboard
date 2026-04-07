import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

const ORDINAL_MAPS: Record<string, Record<string, number>> = {
  confidence: { LOW: 0, MEDIUM: 1, HIGH: 2 },
  status: { pending_review: 0, reviewed: 1 },
  approval: { pending_approval: 0, approved: 1, not_approved: 2 },
};

function compare(sortField: string, va: unknown, vb: unknown): number {
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  const ordinal = ORDINAL_MAPS[sortField];
  if (ordinal && (va as string) in ordinal && (vb as string) in ordinal) {
    return ordinal[va as string] - ordinal[vb as string];
  }
  if (typeof va === 'string' && /^\d{4}-\d{2}-\d{2}/.test(va)) {
    return new Date(va).getTime() - new Date(vb as string).getTime();
  }
  if (!isNaN(Number(va)) && !isNaN(Number(vb)) && va !== '' && vb !== '') {
    return Number(va) - Number(vb);
  }
  return String(va).localeCompare(String(vb), 'en', { sensitivity: 'base' });
}

export function useTableSort<T>(
  items: T[],
  defaultField: string,
  defaultDir: SortDir = 'desc',
  secondaryField?: string,
  secondaryDir?: SortDir,
) {
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

      let cmp = compare(sortField, va, vb);
      cmp = sortDir === 'asc' ? cmp : -cmp;

      // Secondary sort (tiebreaker)
      if (cmp === 0 && secondaryField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sa = (a as any)[secondaryField];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = (b as any)[secondaryField];
        const scmp = compare(secondaryField, sa, sb);
        return (secondaryDir ?? 'asc') === 'asc' ? scmp : -scmp;
      }

      return cmp;
    });
  }, [items, sortField, sortDir, secondaryField, secondaryDir]);

  const sortIndicator = (field: string) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return { sorted, sortField, sortDir, toggleSort, sortIndicator };
}
