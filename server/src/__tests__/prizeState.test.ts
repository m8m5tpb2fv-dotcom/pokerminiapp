import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `prize-state-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('prize period + history', () => {
  it('initializes a period_start automatically and lets it be reset', () => {
    const first = db.getPrizePeriodStart();
    expect(first).toBeTruthy();
    db.resetPrizePeriod();
    const second = db.getPrizePeriodStart();
    expect(second >= first).toBe(true);
  });

  it('returns null when no prize has been awarded yet, then round-trips a recorded prize', () => {
    expect(db.getLastPrize()).toBeNull();
    db.recordPrizeAwarded({ telegramId: 42, displayName: 'Champ', giftId: 'gift1', starCount: 50, netWinnings: 300 });
    const last = db.getLastPrize();
    expect(last).toMatchObject({ telegramId: 42, displayName: 'Champ', giftId: 'gift1', starCount: 50, netWinnings: 300 });
  });

  it('getLastPrize returns the most recently recorded prize', () => {
    db.recordPrizeAwarded({ telegramId: 99, displayName: 'Newer', giftId: 'gift2', starCount: 25, netWinnings: 10 });
    expect(db.getLastPrize()?.telegramId).toBe(99);
  });
});
