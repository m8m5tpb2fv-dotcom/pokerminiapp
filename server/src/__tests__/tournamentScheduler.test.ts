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
let tdb: typeof import('../tournamentDb.js');
let telegram: typeof import('../telegram.js');
let scheduler: typeof import('../tournamentScheduler.js');
let TableManager: typeof import('../tableManager.js').TableManager;
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `tournament-scheduler-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
  tdb = await import('../tournamentDb.js');
  telegram = await import('../telegram.js');
  scheduler = await import('../tournamentScheduler.js');
  ({ TableManager } = await import('../tableManager.js'));
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

function makePlayer(telegramId: number, name: string, stars = 1000): void {
  db.getOrCreateUser(telegramId, name);
  db.adjustBalance(telegramId, stars, 'stars_purchase');
}

describe('registerForTournament / unregisterFromTournament', () => {
  it('deducts the buy-in on register and refunds it on unregister', () => {
    makePlayer(1, 'alice');
    const before = db.getBalance(1);
    scheduler.registerForTournament(1, 'alice');
    expect(db.getBalance(1)).toBe(before - tdb.TOURNAMENT_BUY_IN);
    expect(tdb.isRegistered(1)).toBe(true);

    scheduler.unregisterFromTournament(1);
    expect(db.getBalance(1)).toBe(before);
    expect(tdb.isRegistered(1)).toBe(false);
  });

  it('rejects a duplicate registration and an unaffordable one', () => {
    makePlayer(2, 'bob');
    scheduler.registerForTournament(2, 'bob');
    expect(() => scheduler.registerForTournament(2, 'bob')).toThrow(/already registered/i);
    scheduler.unregisterFromTournament(2);

    db.getOrCreateUser(3, 'poorplayer'); // balance 0
    expect(() => scheduler.registerForTournament(3, 'poorplayer')).toThrow();
    expect(tdb.isRegistered(3)).toBe(false);
  });

  it('rejects registration once the tournament is full', () => {
    for (let i = 10; i < 10 + tdb.TOURNAMENT_SEATS; i++) {
      makePlayer(i, `p${i}`);
      scheduler.registerForTournament(i, `p${i}`);
    }
    makePlayer(20, 'latecomer');
    expect(() => scheduler.registerForTournament(20, 'latecomer')).toThrow(/full/i);
    // Clean up for later tests.
    for (let i = 10; i < 10 + tdb.TOURNAMENT_SEATS; i++) scheduler.unregisterFromTournament(i);
  });
});

describe('startTournament', () => {
  it('refunds everyone and rolls the schedule forward when fewer than 9 registered', () => {
    const tableManager = new TableManager();
    makePlayer(30, 'onlyone');
    scheduler.registerForTournament(30, 'onlyone');
    const balanceAfterRegister = db.getBalance(30);

    scheduler.startTournament(tableManager);

    expect(db.getBalance(30)).toBe(balanceAfterRegister + tdb.TOURNAMENT_BUY_IN);
    expect(tdb.countEntries()).toBe(0);
    expect(tdb.getTournamentState().status).toBe('scheduled');
    expect(tableManager.getTable(tdb.TOURNAMENT_TABLE_ID)!.getView().seats).toHaveLength(0);
  });

  it('seats all 9 players and marks the tournament running when full', () => {
    const tableManager = new TableManager();
    for (let i = 40; i < 40 + tdb.TOURNAMENT_SEATS; i++) {
      makePlayer(i, `p${i}`);
      scheduler.registerForTournament(i, `p${i}`);
    }

    scheduler.startTournament(tableManager);

    const view = tableManager.getTable(tdb.TOURNAMENT_TABLE_ID)!.getView();
    expect(view.seats).toHaveLength(tdb.TOURNAMENT_SEATS);
    // startIfReady() synchronously deals the first hand once all 9 are seated, so the
    // small/big blind are already posted for two seats by the time we read the view here.
    // Assert chip conservation rather than untouched stacks.
    const totalChips = view.seats.reduce((sum, s) => sum + s.stack + s.committedThisStreet, 0);
    expect(totalChips).toBe(tdb.TOURNAMENT_SEATS * tdb.TOURNAMENT_BUY_IN);
    const shortStacks = view.seats.filter((s) => s.stack < tdb.TOURNAMENT_BUY_IN);
    expect(shortStacks.length).toBeLessThanOrEqual(2);
    expect(tdb.getTournamentState().status).toBe('running');
    expect(tdb.countEntries()).toBe(0);
  });
});

describe('finishTournament', () => {
  it('cashes out the winner, records the result, and sends a gift worth 50% of the prize pool', async () => {
    makePlayer(50, 'winner');
    const balanceBefore = db.getBalance(50);

    const fakeTable = {
      getView: () => ({
        seats: [
          { telegramId: 50, displayName: 'winner', stack: 450, status: 'active' },
          { telegramId: 51, displayName: 'loser1', stack: 0, status: 'sitting_out' },
          { telegramId: 52, displayName: 'loser2', stack: 0, status: 'sitting_out' },
        ],
      }),
      standUp: vi.fn((telegramId: number) => (telegramId === 50 ? 450 : 0)),
    };
    const fakeTableManager = { getTable: () => fakeTable, markUnseated: vi.fn(), broadcast: vi.fn() } as unknown as Parameters<typeof scheduler.finishTournament>[0];

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(1000);
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([
      { id: 'small', star_count: 50 },
      { id: 'perfect', star_count: 300 }, // 50% of a 3-seat*150... see below: prize pool here is seats.length * BUY_IN
      { id: 'big', star_count: 1000 },
    ]);
    vi.mocked(telegram.sendGift).mockResolvedValue(undefined);

    await scheduler.finishTournament(fakeTableManager, 'fake-token');

    // prize pool = 3 seats * 50 buy-in = 150; target = 50% = 75 -> priciest affordable is 'small' (50)
    expect(telegram.sendGift).toHaveBeenCalledWith('fake-token', expect.objectContaining({ userId: 50, giftId: 'small' }));
    expect(fakeTable.standUp).toHaveBeenCalledTimes(3);
    expect(db.getBalance(50)).toBe(balanceBefore + 450);

    const last = tdb.getLastTournamentResult();
    expect(last).toMatchObject({ telegramId: 50, displayName: 'winner', giftId: 'small', starCount: 50, prizePool: 150, players: 3 });
    expect(tdb.getTournamentState().status).toBe('scheduled');
  });

  it('records the result without a gift when nothing is affordable', async () => {
    makePlayer(60, 'winner2');
    const fakeTable = {
      getView: () => ({
        seats: [
          { telegramId: 60, displayName: 'winner2', stack: 100, status: 'active' },
          { telegramId: 61, displayName: 'loser', stack: 0, status: 'sitting_out' },
        ],
      }),
      standUp: vi.fn((telegramId: number) => (telegramId === 60 ? 100 : 0)),
    };
    const fakeTableManager = { getTable: () => fakeTable, markUnseated: vi.fn(), broadcast: vi.fn() } as unknown as Parameters<typeof scheduler.finishTournament>[0];

    vi.mocked(telegram.getMyStarBalance).mockResolvedValue(5);
    vi.mocked(telegram.getAvailableGifts).mockResolvedValue([{ id: 'x', star_count: 15 }]);
    vi.mocked(telegram.sendGift).mockClear();

    await scheduler.finishTournament(fakeTableManager, 'fake-token');

    expect(telegram.sendGift).not.toHaveBeenCalled();
    expect(tdb.getLastTournamentResult()).toMatchObject({ telegramId: 60, giftId: null, starCount: null });
  });
});
