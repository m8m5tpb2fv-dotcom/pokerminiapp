import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tdb: typeof import('../tournamentDb.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `tournament-db-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  await import('../db.js');
  tdb = await import('../tournamentDb.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('tournament state', () => {
  it('initializes a future next_start_at and scheduled status', () => {
    const state = tdb.getTournamentState();
    expect(state.status).toBe('scheduled');
    expect(new Date(`${state.nextStartAt.replace(' ', 'T')}Z`).getTime()).toBeGreaterThan(Date.now());
  });

  it('advanceToNextDay rolls the schedule forward from now', () => {
    const before = tdb.getTournamentState().nextStartAt;
    tdb.advanceToNextDay();
    const after = tdb.getTournamentState().nextStartAt;
    expect(after >= before).toBe(true);
  });

  it('setTournamentStatus updates status', () => {
    tdb.setTournamentStatus('running');
    expect(tdb.getTournamentState().status).toBe('running');
    tdb.setTournamentStatus('scheduled');
  });
});

describe('tournament entries', () => {
  it('registers, lists, and counts entries', () => {
    expect(tdb.countEntries()).toBe(0);
    tdb.addEntry(1, 'alice');
    tdb.addEntry(2, 'bob');
    expect(tdb.countEntries()).toBe(2);
    expect(tdb.isRegistered(1)).toBe(true);
    expect(tdb.isRegistered(3)).toBe(false);
    expect(tdb.listEntries()).toEqual([
      { telegramId: 1, displayName: 'alice' },
      { telegramId: 2, displayName: 'bob' },
    ]);
  });

  it('rejects a duplicate registration for the same player', () => {
    expect(() => tdb.addEntry(1, 'alice')).toThrow();
  });

  it('removes an entry on unregister', () => {
    expect(tdb.removeEntry(2)).toBe(true);
    expect(tdb.removeEntry(2)).toBe(false); // already gone
    expect(tdb.countEntries()).toBe(1);
  });

  it('clearEntries empties the table', () => {
    tdb.clearEntries();
    expect(tdb.countEntries()).toBe(0);
  });
});

describe('tournament history', () => {
  it('returns null when nothing has been recorded yet', () => {
    expect(tdb.getLastTournamentResult()).toBeNull();
  });

  it('round-trips a recorded result and returns the most recent one', () => {
    tdb.recordTournamentResult({ telegramId: 1, displayName: 'alice', giftId: 'g1', starCount: 100, prizePool: 450, players: 9 });
    tdb.recordTournamentResult({ telegramId: 2, displayName: 'bob', giftId: null, starCount: null, prizePool: 450, players: 9 });
    const last = tdb.getLastTournamentResult();
    expect(last).toMatchObject({ telegramId: 2, displayName: 'bob', giftId: null, starCount: null, prizePool: 450, players: 9 });
  });
});
