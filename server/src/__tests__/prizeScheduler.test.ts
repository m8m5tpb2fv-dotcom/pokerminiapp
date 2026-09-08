import { describe, expect, it } from 'vitest';
import { pickGiftWithinBudget } from '../prizeScheduler.js';
import type { TelegramGift } from '../telegram.js';

const GIFTS: TelegramGift[] = [
  { id: 'a', star_count: 15 },
  { id: 'b', star_count: 25 },
  { id: 'c', star_count: 50, upgrade_star_count: 40 },
  { id: 'd', star_count: 100, upgrade_star_count: 60 },
];

describe('pickGiftWithinBudget', () => {
  it('picks the priciest plain gift that fits the budget', () => {
    const pick = pickGiftWithinBudget(GIFTS, 30, false);
    expect(pick).toEqual({ gift: GIFTS[1], payForUpgrade: false }); // 25 <= 30, 50 too expensive
  });

  it('prefers the priciest affordable upgrade when wantUpgrade is true', () => {
    const pick = pickGiftWithinBudget(GIFTS, 190, true);
    expect(pick?.payForUpgrade).toBe(true);
    expect(pick?.gift.id).toBe('d'); // 100+60=160 vs 50+40=90, both <= 190, priciest wins
  });

  it('falls back to a plain gift when no upgrade fits the budget', () => {
    const pick = pickGiftWithinBudget(GIFTS, 40, true); // cheapest upgrade (90) too expensive
    expect(pick).toEqual({ gift: GIFTS[1], payForUpgrade: false });
  });

  it('returns null when nothing fits the budget', () => {
    expect(pickGiftWithinBudget(GIFTS, 10, false)).toBeNull(); // below the cheapest gift (15)
    expect(pickGiftWithinBudget(GIFTS, 0, false)).toBeNull();
    expect(pickGiftWithinBudget(GIFTS, -5, false)).toBeNull();
  });
});
