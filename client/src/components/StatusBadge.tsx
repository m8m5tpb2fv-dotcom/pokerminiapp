import type { StatusTier } from '../types';

const FALLBACK_LABELS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  vip: 'VIP',
};

const FALLBACK_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  vip: '#a78bfa',
};

export function StatusBadge({ tierId, tiers }: { tierId: string | null | undefined; tiers?: StatusTier[] }) {
  if (!tierId) return null;
  const tier = tiers?.find((t) => t.id === tierId);
  const label = tier?.label ?? FALLBACK_LABELS[tierId] ?? tierId;
  const color = tier?.color ?? FALLBACK_COLORS[tierId] ?? '#9fb0bd';
  return (
    <span className="status-badge" style={{ color, borderColor: color }}>
      {label}
    </span>
  );
}
