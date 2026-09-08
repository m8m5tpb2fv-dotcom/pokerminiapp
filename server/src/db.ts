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
    nickname TEXT,
    status_tier TEXT,
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

  CREATE TABLE IF NOT EXISTS prize_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    period_start TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prize_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    gift_id TEXT NOT NULL,
    star_count INTEGER NOT NULL,
    net_winnings INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS status_purchases (
    telegram_id INTEGER NOT NULL,
    tier_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (telegram_id, tier_id)
  );

  CREATE TABLE IF NOT EXISTS avatars (
    telegram_id INTEGER PRIMARY KEY,
    data BLOB NOT NULL,
    mime TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare('INSERT OR IGNORE INTO prize_state (id, period_start) VALUES (1, datetime(\'now\'))').run();

// Lightweight migration for databases created before nickname/status_tier/points/rank_tier existed.
const existingColumns = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
if (!existingColumns.has('nickname')) db.exec('ALTER TABLE users ADD COLUMN nickname TEXT');
if (!existingColumns.has('status_tier')) db.exec('ALTER TABLE users ADD COLUMN status_tier TEXT');
if (!existingColumns.has('points')) db.exec('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
if (!existingColumns.has('rank_tier')) db.exec('ALTER TABLE users ADD COLUMN rank_tier TEXT');

export interface UserRow {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  nickname: string | null;
  status_tier: string | null;
  stars_balance: number;
  points: number;
  rank_tier: string | null;
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

const NICKNAME_PATTERN = /^[a-zA-Z0-9_ ]{2,16}$/;

export function isValidNickname(nickname: string): boolean {
  return NICKNAME_PATTERN.test(nickname.trim());
}

export function setNickname(telegramId: number, nickname: string): UserRow {
  const trimmed = nickname.trim();
  if (!isValidNickname(trimmed)) throw new Error('Nickname must be 2-16 characters (letters, numbers, spaces, underscores)');
  db.prepare('UPDATE users SET nickname = ? WHERE telegram_id = ?').run(trimmed, telegramId);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
}

export function setStatusTier(telegramId: number, statusTier: string): UserRow {
  db.prepare('UPDATE users SET status_tier = ? WHERE telegram_id = ?').run(statusTier, telegramId);
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
}

export function recordStatusPurchase(telegramId: number, tierId: string): void {
  db.prepare('INSERT OR IGNORE INTO status_purchases (telegram_id, tier_id) VALUES (?, ?)').run(telegramId, tierId);
}

export function hasOwnedStatusTier(telegramId: number, tierId: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM status_purchases WHERE telegram_id = ? AND tier_id = ?').get(telegramId, tierId)
  );
}

/** Every tier this player has ever paid for, plus their currently-set tier (covers pre-migration data). */
export function getOwnedStatusTiers(telegramId: number): string[] {
  const rows = db.prepare('SELECT tier_id FROM status_purchases WHERE telegram_id = ?').all(telegramId) as { tier_id: string }[];
  const owned = new Set(rows.map((r) => r.tier_id));
  const current = db.prepare('SELECT status_tier FROM users WHERE telegram_id = ?').get(telegramId) as
    | { status_tier: string | null }
    | undefined;
  if (current?.status_tier) owned.add(current.status_tier);
  return [...owned];
}

export function getAllRankedTelegramIds(): { telegramId: number; rankTier: string }[] {
  return db.prepare('SELECT telegram_id as telegramId, rank_tier as rankTier FROM users WHERE rank_tier IS NOT NULL').all() as {
    telegramId: number;
    rankTier: string;
  }[];
}

export function displayNameFor(user: Pick<UserRow, 'telegram_id' | 'username' | 'first_name' | 'nickname'>): string {
  return user.nickname ?? user.username ?? user.first_name ?? `Player ${user.telegram_id}`;
}

export interface ClientUser {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  nickname: string | null;
  statusTier: string | null;
  ownedStatusTiers: string[];
  displayName: string;
  starsBalance: number;
  points: number;
  rankTier: string | null;
  avatarVersion: number | null;
}

export function toClientUser(user: UserRow): ClientUser {
  return {
    telegramId: user.telegram_id,
    username: user.username,
    firstName: user.first_name,
    nickname: user.nickname,
    statusTier: user.status_tier,
    ownedStatusTiers: getOwnedStatusTiers(user.telegram_id),
    displayName: displayNameFor(user),
    starsBalance: user.stars_balance,
    points: user.points,
    rankTier: user.rank_tier,
    avatarVersion: getAvatarVersion(user.telegram_id),
  };
}

/** Stores a resized avatar image (the client is expected to have already downscaled/cropped it). */
export function setAvatar(telegramId: number, data: Buffer, mime: string): void {
  db.prepare(
    `INSERT INTO avatars (telegram_id, data, mime, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(telegram_id) DO UPDATE SET data = excluded.data, mime = excluded.mime, updated_at = excluded.updated_at`
  ).run(telegramId, data, mime);
}

export function getAvatar(telegramId: number): { data: Buffer; mime: string } | null {
  const row = db.prepare('SELECT data, mime FROM avatars WHERE telegram_id = ?').get(telegramId) as
    | { data: Buffer; mime: string }
    | undefined;
  return row ?? null;
}

/** A cache-busting value (ms since epoch) for building `<img>` URLs; null when no avatar is set. */
export function getAvatarVersion(telegramId: number): number | null {
  const row = db.prepare("SELECT strftime('%s', updated_at) as ts FROM avatars WHERE telegram_id = ?").get(telegramId) as
    | { ts: string }
    | undefined;
  return row ? Number(row.ts) * 1000 : null;
}

/** Adds points earned from playing hands; returns the new total and the rank tier held before this gain. */
export function addPoints(telegramId: number, amount: number): { points: number; previousRankTier: string | null } {
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT points, rank_tier FROM users WHERE telegram_id = ?').get(telegramId) as
      | { points: number; rank_tier: string | null }
      | undefined;
    if (!row) throw new Error('User not found');
    const next = row.points + amount;
    db.prepare('UPDATE users SET points = ? WHERE telegram_id = ?').run(next, telegramId);
    return { points: next, previousRankTier: row.rank_tier };
  });
  return tx();
}

export function setRankTier(telegramId: number, rankTier: string): void {
  db.prepare('UPDATE users SET rank_tier = ? WHERE telegram_id = ?').run(rankTier, telegramId);
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

export interface LeaderboardEntry {
  telegramId: number;
  displayName: string;
  statusTier: string | null;
  rankTier: string | null;
  avatarVersion: number | null;
  netWinnings: number;
}

/**
 * Ranks players by lifetime net profit at the tables (cash-outs minus buy-ins),
 * which deliberately excludes Stars purchases so this reflects poker skill/luck
 * rather than spending power. Pass `rankTier` to scope the board to players who
 * currently hold that earned rank (Bronze/Silver/Gold/VIP), for the per-tier weekly boards.
 */
export function getLeaderboard(limit = 20, since?: string, rankTier?: string): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT u.telegram_id as telegramId,
              COALESCE(u.nickname, u.username, u.first_name, 'Player ' || u.telegram_id) as displayName,
              u.status_tier as statusTier,
              u.rank_tier as rankTier,
              CAST(strftime('%s', a.updated_at) AS INTEGER) * 1000 as avatarVersion,
              SUM(t.amount) as netWinnings
       FROM star_transactions t
       JOIN users u ON u.telegram_id = t.telegram_id
       LEFT JOIN avatars a ON a.telegram_id = u.telegram_id
       WHERE t.reason IN ('buy_in', 'cash_out') AND t.created_at >= ?
             ${rankTier ? 'AND u.rank_tier = ?' : ''}
       GROUP BY t.telegram_id
       HAVING netWinnings != 0
       ORDER BY netWinnings DESC
       LIMIT ?`
    )
    .all(...(rankTier ? [since ?? '0000-00-00', rankTier, limit] : [since ?? '0000-00-00', limit])) as LeaderboardEntry[];
  return rows;
}

/** Total real Stars purchased (bot revenue) since a given timestamp — what actually landed in the bot's own Star balance. */
export function getRevenueSince(since: string): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM star_transactions WHERE reason = 'stars_purchase' AND created_at >= ?")
    .get(since) as { total: number };
  return row.total;
}

export interface PrizeHistoryEntry {
  telegramId: number;
  displayName: string;
  giftId: string;
  starCount: number;
  netWinnings: number;
  createdAt: string;
}

export function getPrizePeriodStart(): string {
  const row = db.prepare('SELECT period_start FROM prize_state WHERE id = 1').get() as { period_start: string };
  return row.period_start;
}

export function resetPrizePeriod(): void {
  db.prepare("UPDATE prize_state SET period_start = datetime('now') WHERE id = 1").run();
}

export function recordPrizeAwarded(entry: {
  telegramId: number;
  displayName: string;
  giftId: string;
  starCount: number;
  netWinnings: number;
}): void {
  db.prepare(
    'INSERT INTO prize_history (telegram_id, display_name, gift_id, star_count, net_winnings) VALUES (?, ?, ?, ?, ?)'
  ).run(entry.telegramId, entry.displayName, entry.giftId, entry.starCount, entry.netWinnings);
}

export function getLastPrize(): PrizeHistoryEntry | null {
  const row = db.prepare('SELECT * FROM prize_history ORDER BY id DESC LIMIT 1').get() as
    | {
        telegram_id: number;
        display_name: string;
        gift_id: string;
        star_count: number;
        net_winnings: number;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    telegramId: row.telegram_id,
    displayName: row.display_name,
    giftId: row.gift_id,
    starCount: row.star_count,
    netWinnings: row.net_winnings,
    createdAt: row.created_at,
  };
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
