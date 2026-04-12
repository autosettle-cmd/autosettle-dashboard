/**
 * Shared date and currency formatters
 * Extracted from admin/accountant pages to eliminate duplication
 */

/** Returns today's date in YYYY-MM-DD format */
export function todayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Formats ISO date string to DD/MM/YYYY */
export function formatDate(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
}

/** Formats number to RM currency string */
export function formatRM(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'RM 0.00';
  return `RM ${Number(val).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Calculates date range from preset or custom values */
export function getDateRange(
  range: string,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0];

  switch (range) {
    case 'this_week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { from: iso(monday), to: iso(now) };
    }
    case 'this_month':
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(now),
      };
    case 'last_month':
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      return { from: '', to: '' };
  }
}

/** Converts Date to YYYY-MM-DD for input[type=date] */
export function toInputDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
