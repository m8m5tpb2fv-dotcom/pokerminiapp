import { describe, expect, it } from 'vitest';
import { pickGiftBundleWithinBudget } from '../prizeScheduler.js';
import type { TelegramGift } from '../telegram.js';

const GIFTS: TelegramGift[] = [
  { id: 'a', star_count: 15 },
  { id: 'b', star_count: 25 },
  { id: 'c', star_count: 50, upgrade_star_count: 40 },
  { id: 'd', star_count: 100, upgrade_star_count: 60 },
];

describe('pickGiftBundleWithinBudget', () => {
  it('leads with the priciest affordable upgrade, then tops up with a plain gift', () => {
    const bundle = pickGiftBundleWithinBudget(GIFTS, 190); // d+upgrade=160 leaves 30 for a plain gift
    expect(bundle).not.toBeNull();
    expect(bundle!.picks[0]).toEqual({ gift: GIFTS[3], payForUpgrade: true }); // 160 <= 190, priciest upgrade
    expect(bundle!.picks[1]).toEqual({ gift: GIFTS[1], payForUpgrade: false }); // 25 fits the remaining 30
    expect(bundle!.totalSpent).toBe(185);
  });

  it('combines several plain gifts to use up the budget when no upgrade fits', () => {
    const bundle = pickGiftBundleWithinBudget(GIFTS, 40); // cheapest upgrade (90) too expensive
    expect(bundle).not.toBeNull();
    // Greedy: 25 (b) then 15 (a) fills the 40 budget exactly.
    expect(bundle!.picks.map((p) => p.gift.id)).toEqual(['b', 'a']);
    expect(bundle!.totalSpent).toBe(40);
  });

  it('repeats the same gift multiple times when it fits repeatedly', () => {
    const bundle = pickGiftBundleWithinBudget([{ id: 'x', star_count: 15 }], 50);
    expect(bundle).not.toBeNull();
    expect(bundle!.picks).toHaveLength(3); // 15*3=45, one more 15 would exceed 50
    expect(bundle!.totalSpent).toBe(45);
  });

  it('caps the bundle at 6 gifts even when the budget could fit more of the cheapest one', () => {
    const bundle = pickGiftBundleWithinBudget([{ id: 'x', star_count: 10 }], 1000);
    expect(bundle).not.toBeNull();
    expect(bundle!.picks).toHaveLength(6);
    expect(bundle!.totalSpent).toBe(60);
  });

  it('returns null when nothing fits the budget', () => {
    expect(pickGiftBundleWithinBudget(GIFTS, 10)).toBeNull(); // below the cheapest gift (15)
    expect(pickGiftBundleWithinBudget(GIFTS, 0)).toBeNull();
    expect(pickGiftBundleWithinBudget(GIFTS, -5)).toBeNull();
  });
});
