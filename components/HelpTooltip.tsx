'use client';

import { useState, useRef, useEffect } from 'react';

interface HelpTooltipProps {
  items: { label: string; description: string }[];
}

export default function HelpTooltip({ items }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((p) => !p)}
        className="w-4 h-4 rounded-full border border-[#8E9196]/40 text-[#8E9196] hover:text-[#434654] hover:border-[#434654]/40 flex items-center justify-center transition-colors"
        aria-label="Help"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-[#1B1F2E] text-white rounded-lg shadow-xl p-3 space-y-2 text-xs">
          {items.map((item) => (
            <div key={item.label}>
              <span className="font-semibold text-white/90">{item.label}</span>
              <span className="text-white/60"> — {item.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
