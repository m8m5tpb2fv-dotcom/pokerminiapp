import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `rank-status-backfill-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');

  // Simulate a player who reached VIP rank (e.g. via the admin grant-rank endpoint) before
  // rank/status linking existed: rank_tier is set directly, with no status_purchases rows at all.
  db.getOrCreateUser(1, 'legacy-vip');
  db.setRankTier(1, 'vip');
  db.addPoints(1, 10000);

  // Importing ranking.js runs its one-time backfill migration at module load.
  await import('../ranking.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('rank/status backfill migration', () => {
  it('unlocks every status tier up to a pre-existing rank on startup', () => {
    expect(db.getOwnedStatusTiers(1).sort()).toEqual(['bronze', 'gold', 'silver', 'vip']);
    expect(db.hasOwnedStatusTier(1, 'vip')).toBe(true);
  });
});
