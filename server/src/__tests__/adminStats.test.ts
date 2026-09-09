import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `admin-stats-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('global hands counter', () => {
  it('starts at zero and increments once per call, independent of player-level stats', () => {
    expect(db.getGlobalHandsPlayed()).toBe(0);
    db.incrementGlobalHandsPlayed();
    db.incrementGlobalHandsPlayed();
    expect(db.getGlobalHandsPlayed()).toBe(2);
  });
});

describe('getAdminStats', () => {
  it('reports player counts and Stars revenue split into this week vs all-time', () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');
    db.adjustBalance(1, 500, 'stars_purchase');
    db.adjustBalance(2, 300, 'stars_purchase');
    db.adjustBalance(1, -100, 'buy_in'); // not a purchase, shouldn't count as revenue

    const stats = db.getAdminStats('0000-00-00');
    expect(stats.totalPlayers).toBe(2);
    expect(stats.activePlayersThisWeek).toBe(2);
    expect(stats.weeklyStarsRevenue).toBe(800);
    expect(stats.lifetimeStarsRevenue).toBe(800);
  });

  it('excludes players from "active this week" once the period cutoff is after their last transaction', () => {
    const future = '2999-01-01 00:00:00';
    const stats = db.getAdminStats(future);
    expect(stats.activePlayersThisWeek).toBe(0);
    expect(stats.weeklyStarsRevenue).toBe(0);
    expect(stats.lifetimeStarsRevenue).toBe(800); // unaffected by the "since" cutoff passed for the weekly figure
  });
});
