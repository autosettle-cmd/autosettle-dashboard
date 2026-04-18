import Link from 'next/link';

export default function StatCard({ label, value, amount, color, href }: {
  label: string;
  value: string | number | null;
  amount?: string | null;
  color: 'default' | 'amber' | 'red' | 'primary' | 'green';
  href?: string;
}) {
  const isPrimary = color === 'primary';
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-[#191C1E]' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    red:     { dot: 'bg-red-400', value: 'text-red-600' },
    primary: { dot: '', value: '' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  const card = (
    <div
      className={`dash-tile group ${href ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-1.5 h-1.5 flex-shrink-0 ${accent.dot}`} style={isPrimary ? { backgroundColor: '#234B6E' } : undefined} />
        <p className="text-[10px] font-bold text-[#444650] uppercase tracking-wide leading-tight">{label}</p>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-xl font-extrabold tracking-tight tabular-nums ${accent.value}`} style={isPrimary ? { color: '#234B6E' } : undefined}>
          {value ?? <span className="text-gray-200">&mdash;</span>}
        </p>
        {amount && <p className="text-[10px] font-medium text-[#444650] tabular-nums whitespace-nowrap">{amount}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}
