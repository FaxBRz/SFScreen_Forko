import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomConfigService } from '../../src/main/rooms/room-config-service';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('room configuration', () => {
  it('persists room metadata without exposing the password', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sfscreen-room-'));
    directories.push(directory);
    const rooms = new RoomConfigService(directory);

    const room = await rooms.create('Sala Privada', 'senha-segura');
    expect(room).toEqual({ id: expect.any(String), name: 'Sala Privada', hasPassword: true });
    expect(await rooms.get()).toEqual(room);
    expect(await rooms.verifyPassword('senha-segura')).toBe(true);
    expect(await rooms.verifyPassword('outra-senha')).toBe(false);
    expect(await rooms.removePassword()).toEqual({ ...room, hasPassword: false });
    expect(await rooms.verifyPassword('qualquer-coisa')).toBe(true);
  });
});
