import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let ranking: typeof import('../ranking.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `ranking-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
  ranking = await import('../ranking.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('awardHandPoints', () => {
  it('gives every participant 10 points and the winner 50 more, with no rank yet below 1000', () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');

    ranking.awardHandPoints([1, 2], [1]);

    const alice = db.getOrCreateUser(1);
    const bob = db.getOrCreateUser(2);
    expect(alice.points).toBe(60); // 10 participation + 50 win
    expect(bob.points).toBe(10); // participation only
    expect(alice.rank_tier).toBeNull();
    expect(bob.rank_tier).toBeNull();
    expect(db.getBalance(1)).toBe(0); // no bonus yet, hasn't crossed 1000
  });

  it('awards a one-time Stars bonus and sets the rank tier the moment a threshold is crossed', () => {
    db.getOrCreateUser(3, 'carol');
    // 99 wins (10+50=60 pts each) = 5940, then one more win crosses 6000 (Gold) after also
    // having crossed 1000 (Bronze) and 3000 (Silver) along the way.
    for (let i = 0; i < 99; i++) ranking.awardHandPoints([3], [3]);
    let carol = db.getOrCreateUser(3);
    expect(carol.points).toBe(5940);
    expect(carol.rank_tier).toBe('silver');
    const balanceBeforeGold = db.getBalance(3);

    ranking.awardHandPoints([3], [3]); // 6000 points -> crosses Gold
    carol = db.getOrCreateUser(3);
    expect(carol.points).toBe(6000);
    expect(carol.rank_tier).toBe('gold');
    expect(db.getBalance(3)).toBe(balanceBeforeGold + 100); // Gold bonus only, Bronze/Silver already paid
  });

  it('pays every bonus crossed in a single jump, in order, exactly once', () => {
    db.getOrCreateUser(4, 'dave');
    // Move points past Bronze/Silver/Gold directly (bypassing ranking, so rank_tier stays
    // null) to simulate a gap between recorded rank and actual points, then let a single
    // hand's win push past VIP too. The promotion loop should pay all four bonuses at once.
    db.addPoints(4, 9950);
    expect(db.getOrCreateUser(4).rank_tier).toBeNull();
    const balanceBefore = db.getBalance(4);

    ranking.awardHandPoints([4], [4]); // +60 -> 10010 total, crossing bronze/silver/gold/vip together

    const dave = db.getOrCreateUser(4);
    expect(dave.points).toBe(10010);
    expect(dave.rank_tier).toBe('vip');
    expect(db.getBalance(4)).toBe(balanceBefore + 10 + 50 + 100 + 500);
  });
});

describe('grantRankForTesting', () => {
  it('fast-forwards a fresh player straight to VIP and pays every bonus along the way', () => {
    const balanceBefore = db.getBalance(5); // 0, user doesn't exist yet
    const result = ranking.grantRankForTesting(5, 'vip');

    expect(result).toEqual({ points: 10000, rankTier: 'vip' });
    expect(db.getBalance(5)).toBe(balanceBefore + 10 + 50 + 100 + 500);
  });

  it('tops up only the remaining points when the player already has some', () => {
    db.getOrCreateUser(6, 'erin');
    ranking.awardHandPoints([6], [6]); // 60 points, no rank yet
    const balanceAfterHand = db.getBalance(6);

    const result = ranking.grantRankForTesting(6, 'gold');

    expect(result).toEqual({ points: 6000, rankTier: 'gold' });
    // Bronze + Silver + Gold bonuses, since none had been paid yet.
    expect(db.getBalance(6)).toBe(balanceAfterHand + 10 + 50 + 100);
  });

  it('is a no-op on balance when the player already has more points than the target', () => {
    const result = ranking.grantRankForTesting(6, 'bronze'); // already Gold from the previous test
    expect(result.points).toBe(6000);
    expect(result.rankTier).toBe('gold'); // stays at the higher rank actually earned
  });

  it('rejects an unknown rank id', () => {
    expect(() => ranking.grantRankForTesting(7, 'diamond')).toThrow(/unknown rank/i);
  });
});
