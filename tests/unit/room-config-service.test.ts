import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { roomConfigSchemaVersion, roomMaxCapacity } from '../../src/shared/session/types';
import { RoomConfigService } from '../../src/main/rooms/room-config-service';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sfscreen-room-'));
  directories.push(directory);
  return directory;
};

describe('room configuration', () => {
  it('persists V2 room metadata without exposing the password', async () => {
    const directory = await createDirectory();
    const rooms = new RoomConfigService(directory);

    const room = await rooms.create('Sala Privada', 'senha-segura');
    expect(room).toMatchObject({
      schemaVersion: roomConfigSchemaVersion,
      id: expect.any(String),
      name: 'Sala Privada',
      createdAt: expect.any(String),
      capacity: roomMaxCapacity,
      hasPassword: true,
      needsPassword: false,
    });
    expect(await rooms.get()).toEqual(room);
    expect(await rooms.verifyPassword('senha-segura')).toBe(true);
    expect(await rooms.verifyPassword('outra-senha')).toBe(false);

    const persisted = await readFile(path.join(directory, 'room-config.json'), 'utf8');
    expect(persisted).not.toContain('senha-segura');
    expect(JSON.parse(persisted)).toMatchObject({ schemaVersion: roomConfigSchemaVersion, capacity: roomMaxCapacity });
  });

  it('migrates a passwordless legacy config into a room that requires a password reset', async () => {
    const directory = await createDirectory();
    const legacy = { id: 'a'.repeat(32), name: ' Sala antiga ', hasPassword: false };
    await writeFile(path.join(directory, 'room-config.json'), JSON.stringify(legacy), 'utf8');
    const rooms = new RoomConfigService(directory);

    await expect(rooms.get()).resolves.toMatchObject({
      schemaVersion: roomConfigSchemaVersion,
      id: legacy.id,
      name: 'Sala antiga',
      capacity: roomMaxCapacity,
      hasPassword: false,
      needsPassword: true,
      createdAt: expect.any(String),
    });
    expect(await rooms.verifyPassword('qualquer-coisa')).toBe(false);

    const migrated = JSON.parse(await readFile(path.join(directory, 'room-config.json'), 'utf8')) as Record<string, unknown>;
    expect(migrated).toMatchObject({ schemaVersion: roomConfigSchemaVersion, capacity: roomMaxCapacity, needsPassword: true });
    expect(migrated).not.toHaveProperty('passwordSalt');
    expect(migrated).not.toHaveProperty('passwordVerifier');

    await expect(rooms.updatePassword('nova-senha')).resolves.toMatchObject({ hasPassword: true, needsPassword: false });
    expect(await rooms.verifyPassword('nova-senha')).toBe(true);
  });

  it('does not reopen a room after removing its password and deletes configuration explicitly', async () => {
    const directory = await createDirectory();
    const rooms = new RoomConfigService(directory);
    await rooms.create('Sala Privada', 'senha-segura');

    await expect(rooms.removePassword()).resolves.toMatchObject({ hasPassword: false, needsPassword: true });
    expect(await rooms.verifyPassword('senha-segura')).toBe(false);
    await rooms.delete();
    await expect(rooms.get()).resolves.toBeUndefined();
  });
});
