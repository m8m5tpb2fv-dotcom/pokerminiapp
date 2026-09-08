import { describe, expect, it } from 'vitest';
import { pickAffordableGift } from '../prizeScheduler.js';
import type { TelegramGift } from '../telegram.js';

const GIFTS: TelegramGift[] = [
  { id: 'a', star_count: 15 },
  { id: 'b', star_count: 25 },
  { id: 'c', star_count: 50, upgrade_star_count: 40 },
  { id: 'd', star_count: 100, upgrade_star_count: 60 },
];

describe('pickAffordableGift', () => {
  it('picks the priciest plain gift affordable within balance minus reserve', () => {
    const pick = pickAffordableGift(GIFTS, 40, false);
    expect(pick).toEqual({ gift: GIFTS[1], payForUpgrade: false }); // 25 <= 40-10=30, 50 too expensive
  });

  it('prefers the cheapest affordable upgrade when wantUpgrade is true', () => {
    const pick = pickAffordableGift(GIFTS, 200, true);
    expect(pick?.payForUpgrade).toBe(true);
    expect(pick?.gift.id).toBe('c'); // 50+40=90 vs 100+60=160, both <= 190, cheapest wins
  });

  it('falls back to a plain gift when no upgrade fits the budget', () => {
    const pick = pickAffordableGift(GIFTS, 50, true); // spendable 40; cheapest upgrade (90) too expensive
    expect(pick).toEqual({ gift: GIFTS[1], payForUpgrade: false });
  });

  it('returns null when nothing fits even the cheapest gift after the reserve', () => {
    expect(pickAffordableGift(GIFTS, 20, false)).toBeNull(); // spendable 10, cheapest gift is 15
    expect(pickAffordableGift(GIFTS, 5, false)).toBeNull(); // spendable negative
  });
});
