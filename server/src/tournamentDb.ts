import { db } from './db.js';

export const TOURNAMENT_TABLE_ID = 'tournament';
export const TOURNAMENT_SEATS = 9;
export const TOURNAMENT_BUY_IN = 50;
export const TOURNAMENT_BLIND_SB = 5;
export const TOURNAMENT_BLIND_BB = 10;
/** Daily start time, UTC hour. */
export const TOURNAMENT_START_HOUR_UTC = 20;

db.exec(`
  CREATE TABLE IF NOT EXISTS tournament_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_start_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
  );

  CREATE TABLE IF NOT EXISTS tournament_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tournament_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    gift_id TEXT,
    star_count INTEGER,
    prize_pool INTEGER NOT NULL,
    players INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function nextDailyStartFrom(from: Date): string {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), TOURNAMENT_START_HOUR_UTC, 0, 0)
  );
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().replace('T', ' ').slice(0, 19);
}

db.prepare('INSERT OR IGNORE INTO tournament_state (id, next_start_at, status) VALUES (1, ?, ?)').run(
  nextDailyStartFrom(new Date()),
  'scheduled'
);

export interface TournamentState {
  nextStartAt: string;
  status: 'scheduled' | 'running';
}

export function getTournamentState(): TournamentState {
  const row = db.prepare('SELECT next_start_at as nextStartAt, status FROM tournament_state WHERE id = 1').get() as TournamentState;
  return row;
}

export function setTournamentStatus(status: TournamentState['status']): void {
  db.prepare('UPDATE tournament_state SET status = ? WHERE id = 1').run(status);
}

/** Rolls the schedule forward to the next day's slot, measured from now (so a late-running check doesn't compress the gap). */
export function advanceToNextDay(): void {
  db.prepare('UPDATE tournament_state SET next_start_at = ? WHERE id = 1').run(nextDailyStartFrom(new Date()));
}

export interface TournamentEntry {
  telegramId: number;
  displayName: string;
}

export function listEntries(): TournamentEntry[] {
  return db.prepare('SELECT telegram_id as telegramId, display_name as displayName FROM tournament_entries ORDER BY id').all() as TournamentEntry[];
}

export function countEntries(): number {
  const row = db.prepare('SELECT COUNT(*) as n FROM tournament_entries').get() as { n: number };
  return row.n;
}

export function isRegistered(telegramId: number): boolean {
  return Boolean(db.prepare('SELECT 1 FROM tournament_entries WHERE telegram_id = ?').get(telegramId));
}

export function addEntry(telegramId: number, displayName: string): void {
  db.prepare('INSERT INTO tournament_entries (telegram_id, display_name) VALUES (?, ?)').run(telegramId, displayName);
}

export function removeEntry(telegramId: number): boolean {
  const result = db.prepare('DELETE FROM tournament_entries WHERE telegram_id = ?').run(telegramId);
  return result.changes > 0;
}

export function clearEntries(): void {
  db.exec('DELETE FROM tournament_entries');
}

export interface TournamentResult {
  telegramId: number;
  displayName: string;
  giftId: string | null;
  starCount: number | null;
  prizePool: number;
  players: number;
  createdAt: string;
}

export function recordTournamentResult(entry: Omit<TournamentResult, 'createdAt'>): void {
  db.prepare(
    'INSERT INTO tournament_history (telegram_id, display_name, gift_id, star_count, prize_pool, players) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(entry.telegramId, entry.displayName, entry.giftId, entry.starCount, entry.prizePool, entry.players);
}

export function getLastTournamentResult(): TournamentResult | null {
  const row = db.prepare('SELECT * FROM tournament_history ORDER BY id DESC LIMIT 1').get() as
    | {
        telegram_id: number;
        display_name: string;
        gift_id: string | null;
        star_count: number | null;
        prize_pool: number;
        players: number;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    telegramId: row.telegram_id,
    displayName: row.display_name,
    giftId: row.gift_id,
    starCount: row.star_count,
    prizePool: row.prize_pool,
    players: row.players,
    createdAt: row.created_at,
  };
}
