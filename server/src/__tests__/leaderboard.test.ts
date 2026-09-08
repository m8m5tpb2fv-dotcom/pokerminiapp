import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `leaderboard-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('getLeaderboard', () => {
  it('ranks players by net buy-in/cash-out profit, excluding Stars purchases', () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');
    db.getOrCreateUser(3, 'carol');

    // Purchases alone should never appear on the leaderboard.
    db.adjustBalance(1, 1000, 'stars_purchase');
    db.adjustBalance(2, 1000, 'stars_purchase');
    db.adjustBalance(3, 1000, 'stars_purchase');

    // Alice buys in for 200, cashes out with 350: +150 net.
    db.adjustBalance(1, -200, 'buy_in');
    db.adjustBalance(1, 350, 'cash_out');

    // Bob buys in for 200, cashes out with 50: -150 net.
    db.adjustBalance(2, -200, 'buy_in');
    db.adjustBalance(2, 50, 'cash_out');

    // Carol only ever bought Stars and never played a hand.
    const board = db.getLeaderboard();

    expect(board.map((e) => e.telegramId)).not.toContain(3);
    expect(board[0]).toMatchObject({ telegramId: 1, displayName: 'alice', netWinnings: 150 });
    expect(board[1]).toMatchObject({ telegramId: 2, displayName: 'bob', netWinnings: -150 });
  });

  it('respects the limit parameter', () => {
    for (let i = 100; i < 130; i++) {
      db.getOrCreateUser(i, `p${i}`);
      db.adjustBalance(i, 10, 'stars_purchase');
      db.adjustBalance(i, -10, 'buy_in');
      db.adjustBalance(i, 10 + i, 'cash_out');
    }
    expect(db.getLeaderboard(5)).toHaveLength(5);
  });
});
