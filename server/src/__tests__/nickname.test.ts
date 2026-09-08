import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `nickname-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('isValidNickname', () => {
  it('accepts 2-16 letters/numbers/spaces/underscores', () => {
    expect(db.isValidNickname('Ace')).toBe(true);
    expect(db.isValidNickname('The_Shark_99')).toBe(true);
  });

  it('rejects too short, too long, or disallowed characters', () => {
    expect(db.isValidNickname('a')).toBe(false);
    expect(db.isValidNickname('a'.repeat(17))).toBe(false);
    expect(db.isValidNickname('bad<script>')).toBe(false);
  });
});

describe('setNickname / displayNameFor', () => {
  it('prefers nickname over username/first_name once set', () => {
    db.getOrCreateUser(500, 'tguser', 'Telegram First');
    expect(db.displayNameFor(db.getOrCreateUser(500))).toBe('tguser');

    const updated = db.setNickname(500, 'PokerFace');
    expect(updated.nickname).toBe('PokerFace');
    expect(db.displayNameFor(updated)).toBe('PokerFace');
  });

  it('rejects an invalid nickname without changing the stored value', () => {
    db.getOrCreateUser(501, 'someone');
    expect(() => db.setNickname(501, 'x')).toThrow();
    const user = db.getOrCreateUser(501);
    expect(user.nickname).toBeNull();
  });
});

describe('setStatusTier', () => {
  it('stores the purchased status tier', () => {
    db.getOrCreateUser(502, 'buyer');
    const updated = db.setStatusTier(502, 'gold');
    expect(updated.status_tier).toBe('gold');
  });
});
