export interface RankTier {
  id: string;
  label: string;
  threshold: number;
  bonus: number;
  color: string;
}

/**
 * Earned automatically by playing hands (see ranking.ts) — separate from the
 * purchasable STATUS_TIERS badges in statusTiers.ts.
 */
export const RANK_TIERS: RankTier[] = [
  { id: 'bronze', label: 'Bronze', threshold: 1000, bonus: 10, color: '#cd7f32' },
  { id: 'silver', label: 'Silver', threshold: 3000, bonus: 50, color: '#c0c0c0' },
  { id: 'gold', label: 'Gold', threshold: 6000, bonus: 100, color: '#ffd700' },
  { id: 'vip', label: 'VIP', threshold: 10000, bonus: 500, color: '#a78bfa' },
];

export function tierForPoints(points: number): RankTier | null {
  let result: RankTier | null = null;
  for (const tier of RANK_TIERS) {
    if (points >= tier.threshold) result = tier;
  }
  return result;
}

export function nextTierForPoints(points: number): RankTier | null {
  return RANK_TIERS.find((t) => points < t.threshold) ?? null;
}
