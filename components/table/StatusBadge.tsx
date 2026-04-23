/**
 * Unified badge component for all status indicators
 * Replaces: StatusCell, ApprovalCell, PaymentCell, LinkCell, ConfidenceCell, LinkedCell, PaymentStatusCell
 */

import {
  STATUS_CFG,
  APPROVAL_CFG,
  PAYMENT_CFG,
  LINK_CFG,
  CONFIDENCE_CFG,
  MATCH_STATUS_CFG,
  type BadgeConfig,
} from '@/lib/badge-config';

type BadgeType = 'status' | 'approval' | 'payment' | 'link' | 'confidence' | 'linked' | 'match';

interface StatusBadgeProps {
  type: BadgeType;
  value: string | number | null | undefined;
}

const CONFIG_MAP: Record<string, Record<string, BadgeConfig>> = {
  status: STATUS_CFG,
  approval: APPROVAL_CFG,
  payment: PAYMENT_CFG,
  link: LINK_CFG,
  match: MATCH_STATUS_CFG,
};

export default function StatusBadge({ type, value }: StatusBadgeProps) {
  if (value === null || value === undefined) return null;

  // Special handling for confidence (color only, no badge)
  if (type === 'confidence') {
    const cls = CONFIDENCE_CFG[String(value)] || 'text-gray-600';
    return <span className={`text-xs font-semibold ${cls}`}>{value}</span>;
  }

  // Special handling for linked count
  if (type === 'linked') {
    const count = Number(value);
    return count > 0
      ? <span className="badge-green">Linked</span>
      : <span className="badge-gray">Unlinked</span>;
  }

  // Standard badge lookup
  const config = CONFIG_MAP[type];
  if (!config) return null;

  const cfg = config[String(value)];
  if (!cfg) return null;

  return <span className={cfg.cls} data-tooltip={cfg.tooltip}>{cfg.label}</span>;
}

// Named exports for convenience (drop-in replacements)
export function StatusCell({ value }: { value: string }) {
  return <StatusBadge type="status" value={value} />;
}

export function ApprovalCell({ value }: { value: string }) {
  return <StatusBadge type="approval" value={value} />;
}

export function PaymentCell({ value }: { value: string }) {
  return <StatusBadge type="payment" value={value} />;
}

export function PaymentStatusCell({ value }: { value: string }) {
  return <StatusBadge type="payment" value={value} />;
}

export function LinkCell({ value }: { value: string }) {
  return <StatusBadge type="link" value={value} />;
}

export function ConfidenceCell({ value }: { value: string }) {
  return <StatusBadge type="confidence" value={value} />;
}

export function LinkedCell({ value }: { value: number }) {
  return <StatusBadge type="linked" value={value} />;
}

export function MatchStatusCell({ value }: { value: string }) {
  return <StatusBadge type="match" value={value} />;
}
