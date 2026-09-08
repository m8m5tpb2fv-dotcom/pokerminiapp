export interface StatusTier {
  id: string;
  label: string;
  price: number;
  color: string;
}

/** Cosmetic-only ranks players can buy with their in-app Stars balance. Purely a badge next to their name — no gameplay effect. */
export const STATUS_TIERS: StatusTier[] = [
  { id: 'bronze', label: 'Bronze', price: 100, color: '#cd7f32' },
  { id: 'silver', label: 'Silver', price: 300, color: '#c0c0c0' },
  { id: 'gold', label: 'Gold', price: 700, color: '#ffd700' },
  { id: 'vip', label: 'VIP', price: 1500, color: '#a78bfa' },
];

export function findStatusTier(id: string): StatusTier | undefined {
  return STATUS_TIERS.find((t) => t.id === id);
}
