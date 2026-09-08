import { describe, expect, it } from 'vitest';
import { tierRank } from '../statusTiers.js';

describe('tierRank', () => {
  it('orders tiers ascending: bronze < silver < gold < vip', () => {
    expect(tierRank('bronze')).toBeLessThan(tierRank('silver'));
    expect(tierRank('silver')).toBeLessThan(tierRank('gold'));
    expect(tierRank('gold')).toBeLessThan(tierRank('vip'));
  });

  it('returns -1 for no status (null)', () => {
    expect(tierRank(null)).toBe(-1);
    expect(tierRank(null)).toBeLessThan(tierRank('bronze'));
  });

  it('returns -1 for an unknown id', () => {
    expect(tierRank('platinum')).toBe(-1);
  });
});
