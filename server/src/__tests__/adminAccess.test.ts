import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `admin-access-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  process.env.ADMIN_TELEGRAM_ID = '777';
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
  delete process.env.ADMIN_TELEGRAM_ID;
});

describe('ClientUser.isAdmin', () => {
  it('is true only for the telegram id configured via ADMIN_TELEGRAM_ID', () => {
    const admin = db.getOrCreateUser(777, 'owner');
    const regular = db.getOrCreateUser(778, 'someoneelse');

    expect(db.toClientUser(admin).isAdmin).toBe(true);
    expect(db.toClientUser(regular).isAdmin).toBe(false);
  });
});
