import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../telegram.js', async () => {
  const actual = await vi.importActual<typeof import('../telegram.js')>('../telegram.js');
  return {
    ...actual,
    getMyStarBalance: vi.fn(),
    getAvailableGifts: vi.fn(),
    sendGift: vi.fn(),
  };
});

let db: typeof import('../db.js');
let telegram: typeof import('../telegram.js');
let scheduler: typeof import('../prizeScheduler.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `prize-integration-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
  telegram = await import('../telegram.js');
  scheduler = await import('../prizeScheduler.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

function backdatePeriodStart(daysAgo: number): void {
  db.db.prepare("UPDATE prize_state SET period_start = datetime('now', ?) WHERE id = 1").run(`-${daysAgo} days`);
}

describe('checkAndAwardWeeklyPrize', () => {
  it('does nothing before a week has elapsed', async () => {
    db.resetPrizePeriod();
    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });

  it('does nothing in dev mode (no bot token)', async () => {
    backdatePeriodStart(8);
    await scheduler.checkAndAwardWeeklyPrize(undefined);
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });

  it('resets the period without sending a gift when nobody played', async () => {
    backdatePeriodStart(8);
    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
    // Period should have been reset even with no winner, so it doesn't re-check every hour forever.
    const periodStart = db.getPrizePeriodStart();
    expect(new Date(`${periodStart.replace(' ', 'T')}Z`).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('awards the top player a gift once the period elapses and resets the period', async () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');
    db.adjustBalance(1, 1000, 'stars_purchase');
    db.adjustBalance(2, 1000, 'stars_purchase');
    db.adjustBalance(1, -200, 'buy_in');
    db.adjustBalance(1, 350, 'cash_out'); // alice: +150
    db.adjustBalance(2, -200, 'buy_in');
    db.adjustBalance(2, 50, 'cash_out'); // bob: -150

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(100);
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([
      { id: 'cheap', star_count: 15 },
      { id: 'mid', star_count: 50 },
    ]);
    vi.mocked(telegram.sendGift).mockResolvedValue(undefined);

    backdatePeriodStart(8);
    await scheduler.checkAndAwardWeeklyPrize('fake-token');

    expect(telegram.sendGift).toHaveBeenCalledTimes(1);
    expect(telegram.sendGift).toHaveBeenCalledWith('fake-token', expect.objectContaining({ userId: 1, giftId: 'mid' }));

    const last = db.getLastPrize();
    expect(last).toMatchObject({ telegramId: 1, displayName: 'alice', giftId: 'mid', starCount: 50, netWinnings: 150 });
  });

  it('skips awarding (without losing the winner) when the bot balance is too low', async () => {
    backdatePeriodStart(8);
    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(5);
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([{ id: 'cheap', star_count: 15 }]);
    vi.mocked(telegram.sendGift).mockClear();

    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });
});
