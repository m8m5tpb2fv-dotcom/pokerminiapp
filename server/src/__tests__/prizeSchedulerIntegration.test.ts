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

/** All comfortably more than PERIOD_MS (7 days) before the real "now" this test runs in. */
function setPeriodStart(value: string): void {
  db.db.prepare('UPDATE prize_state SET period_start = ? WHERE id = 1').run(value);
}

function insertTransaction(telegramId: number, amount: number, reason: string, createdAt: string): void {
  db.db
    .prepare('INSERT INTO star_transactions (telegram_id, amount, reason, created_at) VALUES (?, ?, ?, ?)')
    .run(telegramId, amount, reason, createdAt);
}

describe('checkAndAwardWeeklyPrize', () => {
  it('does nothing before a week has elapsed', async () => {
    db.resetPrizePeriod(); // period_start = now, well within the week
    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });

  it('does nothing in dev mode (no bot token)', async () => {
    setPeriodStart('2025-01-01 00:00:00');
    await scheduler.checkAndAwardWeeklyPrize(undefined);
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });

  it('resets the period without sending a gift when nobody played', async () => {
    setPeriodStart('2025-01-01 00:00:00');
    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
    expect(db.getPrizePeriodStart()).not.toBe('2025-01-01 00:00:00'); // reset so it stops re-checking forever
  });

  it('skips (without losing the winner) when nobody purchased Stars this period', async () => {
    db.getOrCreateUser(701, 'nopurchase');
    db.getOrCreateUser(702, 'nopurchase2');
    // Give both players spendable balance from a purchase dated BEFORE this period starts.
    insertTransaction(701, 500, 'stars_purchase', '2024-01-01 00:00:00');
    insertTransaction(702, 500, 'stars_purchase', '2024-01-01 00:00:00');
    setPeriodStart('2025-02-01 00:00:00');
    // Play a hand entirely within the period, but with no new purchase in that window.
    insertTransaction(701, -100, 'buy_in', '2025-02-02 00:00:00');
    insertTransaction(701, 180, 'cash_out', '2025-02-02 00:00:01');
    insertTransaction(702, -100, 'buy_in', '2025-02-02 00:00:00');
    insertTransaction(702, 20, 'cash_out', '2025-02-02 00:00:01');

    await scheduler.checkAndAwardWeeklyPrize('fake-token');

    expect(telegram.sendGift).not.toHaveBeenCalled();
    expect(db.getPrizePeriodStart()).not.toBe('2025-02-01 00:00:00'); // still resets so it doesn't loop forever
  });

  it("awards the top player a gift worth ~50% of this period's Stars revenue", async () => {
    db.getOrCreateUser(1, 'alice');
    db.getOrCreateUser(2, 'bob');
    setPeriodStart('2025-03-01 00:00:00');
    insertTransaction(1, 200, 'stars_purchase', '2025-03-02 00:00:00');
    insertTransaction(2, 200, 'stars_purchase', '2025-03-02 00:00:00'); // 400 total revenue this period -> target 200
    insertTransaction(1, -200, 'buy_in', '2025-03-03 00:00:00');
    insertTransaction(1, 350, 'cash_out', '2025-03-03 00:00:01'); // alice: +150
    insertTransaction(2, -200, 'buy_in', '2025-03-03 00:00:00');
    insertTransaction(2, 50, 'cash_out', '2025-03-03 00:00:01'); // bob: -150

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(1000);
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([
      { id: 'cheap', star_count: 15 },
      { id: 'mid', star_count: 100 },
      { id: 'big', star_count: 250 }, // more than the 200 target, should not be picked
    ]);
    vi.mocked(telegram.sendGift).mockResolvedValue(undefined);

    await scheduler.checkAndAwardWeeklyPrize('fake-token');

    expect(telegram.sendGift).toHaveBeenCalledWith('fake-token', expect.objectContaining({ userId: 1, giftId: 'mid' }));
    expect(db.getLastPrize()).toMatchObject({ telegramId: 1, displayName: 'alice', giftId: 'mid', starCount: 100, netWinnings: 150 });
  });

  it("caps the prize at the bot's available balance even when 50% of revenue is higher", async () => {
    db.getOrCreateUser(3, 'carol');
    db.getOrCreateUser(4, 'dave');
    setPeriodStart('2025-04-01 00:00:00');
    insertTransaction(3, 1000, 'stars_purchase', '2025-04-02 00:00:00'); // 1000 revenue -> target 500
    insertTransaction(3, -50, 'buy_in', '2025-04-03 00:00:00');
    insertTransaction(3, 90, 'cash_out', '2025-04-03 00:00:01'); // carol: +40
    insertTransaction(4, -50, 'buy_in', '2025-04-03 00:00:00');
    insertTransaction(4, 10, 'cash_out', '2025-04-03 00:00:01'); // dave: -40

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(60); // spendable = 60 - 10 reserve = 50, far below the 500 target
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([
      { id: 'cheap', star_count: 15 },
      { id: 'mid', star_count: 50 },
    ]);
    vi.mocked(telegram.sendGift).mockClear();
    vi.mocked(telegram.sendGift).mockResolvedValue(undefined);

    await scheduler.checkAndAwardWeeklyPrize('fake-token');

    expect(telegram.sendGift).toHaveBeenCalledWith('fake-token', expect.objectContaining({ userId: 3, giftId: 'mid' }));
  });

  it('skips (without losing the winner) when even the cheapest gift is unaffordable', async () => {
    db.getOrCreateUser(5, 'erin');
    setPeriodStart('2025-05-01 00:00:00');
    insertTransaction(5, 100, 'stars_purchase', '2025-05-02 00:00:00');
    insertTransaction(5, -50, 'buy_in', '2025-05-03 00:00:00');
    insertTransaction(5, 90, 'cash_out', '2025-05-03 00:00:01');

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(5); // spendable negative after reserve
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([{ id: 'cheap', star_count: 15 }]);
    vi.mocked(telegram.sendGift).mockClear();

    await scheduler.checkAndAwardWeeklyPrize('fake-token');
    expect(telegram.sendGift).not.toHaveBeenCalled();
  });
});
