import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let handStats: typeof import('../handStats.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `hand-stats-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
  handStats = await import('../handStats.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('recordHandStats / getPlayerStats', () => {
  it('counts hands played/won and tracks the biggest single win', () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');

    handStats.recordHandStats([1, 2], [{ telegramId: 1, amount: 120 }]);
    handStats.recordHandStats([1, 2], [{ telegramId: 2, amount: 40 }]);
    handStats.recordHandStats([1, 2], [{ telegramId: 1, amount: 300 }]);

    expect(db.getPlayerStats(1)).toEqual({ handsPlayed: 3, handsWon: 2, biggestWin: 300 });
    expect(db.getPlayerStats(2)).toEqual({ handsPlayed: 3, handsWon: 1, biggestWin: 40 });
  });

  it('returns zeroed stats for a player who has never played a hand', () => {
    db.getOrCreateUser(3, 'carol');
    expect(db.getPlayerStats(3)).toEqual({ handsPlayed: 0, handsWon: 0, biggestWin: 0 });
  });
});
