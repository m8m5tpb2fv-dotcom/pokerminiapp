import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(__dirname, '..', 'data.sqlite');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    stars_balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS star_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    telegram_payment_charge_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
  );
`);

export interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  stars_balance: number;
  created_at: string;
}

export function getOrCreateUser(telegramId: number, username?: string, firstName?: string): UserRow {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow | undefined;
  if (existing) {
    if (username !== undefined || firstName !== undefined) {
      db.prepare('UPDATE users SET username = COALESCE(?, username), first_name = COALESCE(?, first_name) WHERE telegram_id = ?')
        .run(username ?? null, firstName ?? null, telegramId);
    }
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
  }
  db.prepare('INSERT INTO users (telegram_id, username, first_name, stars_balance) VALUES (?, ?, ?, 0)')
    .run(telegramId, username ?? null, firstName ?? null);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
}

export function getBalance(telegramId: number): number {
  const row = db.prepare('SELECT stars_balance FROM users WHERE telegram_id = ?').get(telegramId) as
    | { stars_balance: number }
    | undefined;
  return row?.stars_balance ?? 0;
}

/** Dev-mode convenience so the app is playable without wiring up real Telegram Stars payments. */
export function grantDevStarterBalanceIfEmpty(telegramId: number, amount = 1000): void {
  const balance = getBalance(telegramId);
  if (balance === 0) adjustBalance(telegramId, amount, 'dev_starter_grant');
}

/** Adjust a user's star balance atomically; throws if it would go negative. */
export function adjustBalance(telegramId: number, delta: number, reason: string, chargeId?: string): number {
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT stars_balance FROM users WHERE telegram_id = ?').get(telegramId) as
      | { stars_balance: number }
      | undefined;
    if (!row) throw new Error('User not found');
    const next = row.stars_balance + delta;
    if (next < 0) throw new Error('Insufficient stars balance');
    db.prepare('UPDATE users SET stars_balance = ? WHERE telegram_id = ?').run(next, telegramId);
    db.prepare(
      'INSERT INTO star_transactions (telegram_id, amount, reason, telegram_payment_charge_id) VALUES (?, ?, ?, ?)'
    ).run(telegramId, delta, reason, chargeId ?? null);
    return next;
  });
  return tx();
}
