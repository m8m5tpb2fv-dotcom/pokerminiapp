import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: typeof import('../db.js');
let tmpFile: string;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `avatar-test-${Date.now()}-${Math.random()}.sqlite`);
  process.env.DB_PATH = tmpFile;
  db = await import('../db.js');
});

afterAll(() => {
  fs.rmSync(tmpFile, { force: true });
  fs.rmSync(`${tmpFile}-wal`, { force: true });
  fs.rmSync(`${tmpFile}-shm`, { force: true });
  delete process.env.DB_PATH;
});

describe('avatars', () => {
  it('returns null and no version when nothing is set', () => {
    db.getOrCreateUser(600, 'noavatar');
    expect(db.getAvatar(600)).toBeNull();
    expect(db.getAvatarVersion(600)).toBeNull();
  });

  it('stores and retrieves an avatar image with its mime type', () => {
    db.getOrCreateUser(601, 'hasavatar');
    const data = Buffer.from([1, 2, 3, 4]);
    db.setAvatar(601, data, 'image/jpeg');

    const avatar = db.getAvatar(601);
    expect(avatar).not.toBeNull();
    expect(avatar!.data).toEqual(data);
    expect(avatar!.mime).toBe('image/jpeg');
    expect(db.getAvatarVersion(601)).toEqual(expect.any(Number));
  });

  it('replaces a previously set avatar on re-upload', () => {
    db.getOrCreateUser(602, 'reupload');
    db.setAvatar(602, Buffer.from([9]), 'image/png');
    db.setAvatar(602, Buffer.from([1, 2]), 'image/webp');

    const avatar = db.getAvatar(602);
    expect(avatar!.data).toEqual(Buffer.from([1, 2]));
    expect(avatar!.mime).toBe('image/webp');
  });

  it('is reflected in toClientUser as avatarVersion', () => {
    const user = db.getOrCreateUser(603, 'clientuser');
    expect(db.toClientUser(user).avatarVersion).toBeNull();

    db.setAvatar(603, Buffer.from([1]), 'image/jpeg');
    expect(db.toClientUser(db.getOrCreateUser(603)).avatarVersion).toEqual(expect.any(Number));
  });
});
