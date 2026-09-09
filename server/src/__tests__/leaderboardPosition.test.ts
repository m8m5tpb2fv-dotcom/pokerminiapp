import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `leaderboard-position-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('getLeaderboardPosition', () => {
  it("reports a player's 1-based rank among everyone with a net result this period", () => {
    db.getOrCreateUser(1, 'first');
    db.adjustBalance(1, 50, 'stars_purchase');
    db.adjustBalance(1, -50, 'buy_in');
    db.adjustBalance(1, 400, 'cash_out'); // net +350

    db.getOrCreateUser(2, 'second');
    db.adjustBalance(2, 50, 'stars_purchase');
    db.adjustBalance(2, -50, 'buy_in');
    db.adjustBalance(2, 150, 'cash_out'); // net +100

    expect(db.getLeaderboardPosition(1, '0000-00-00')).toBe(1);
    expect(db.getLeaderboardPosition(2, '0000-00-00')).toBe(2);
  });

  it('returns null for a player with no net result this period', () => {
    db.getOrCreateUser(3, 'neverplayed');
    expect(db.getLeaderboardPosition(3, '0000-00-00')).toBeNull();
  });
});
