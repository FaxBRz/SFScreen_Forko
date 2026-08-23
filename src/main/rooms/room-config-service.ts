import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { roomConfigSchemaVersion, roomMaxCapacity, type RoomConfigV2 } from '../../shared/session/types';

export type { LocalRoomConfig, RoomConfigV2 } from '../../shared/session/types';

interface StoredRoomConfig extends RoomConfigV2 {
  passwordSalt?: string;
  passwordVerifier?: string;
}

const configFileName = 'room-config.json';
const passwordSaltBytes = 16;
const passwordVerifierBytes = 32;

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

const isFixedBase64 = (value: unknown, expectedLength: number): value is string => {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, 'base64').length === expectedLength;
};

const publicRoom = (room: StoredRoomConfig): RoomConfigV2 => ({
  schemaVersion: room.schemaVersion,
  id: room.id,
  name: room.name,
  createdAt: room.createdAt,
  capacity: room.capacity,
  hasPassword: room.hasPassword,
  needsPassword: room.needsPassword,
});

/**
 * Local-only, password-verifier-backed room metadata. It never persists chat,
 * membership, invite codes, tokens, or any signaling data.
 */
export class RoomConfigService {
  constructor(private readonly dataDirectory: string) {}

  private get filePath(): string {
    return path.join(this.dataDirectory, configFileName);
  }

  private async createdAtFromFile(): Promise<string> {
    try {
      const metadata = await stat(this.filePath);
      const timestamp = metadata.birthtimeMs > 0 ? metadata.birthtimeMs : metadata.mtimeMs;
      if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toISOString();
    } catch {
      // A missing or inaccessible legacy file is handled by read().
    }
    return new Date().toISOString();
  }

  private async normalize(value: unknown): Promise<{ room: StoredRoomConfig; migrated: boolean } | undefined> {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as Record<string, unknown>;
    if (typeof source.id !== 'string' || source.id.length < 16 || source.id.length > 128 || typeof source.name !== 'string') return undefined;
    const name = source.name.trim().slice(0, 48);
    if (!name) return undefined;

    const createdAt = isTimestamp(source.createdAt) ? source.createdAt : await this.createdAtFromFile();
    const passwordSalt = isFixedBase64(source.passwordSalt, passwordSaltBytes) ? source.passwordSalt : undefined;
    const passwordVerifier = isFixedBase64(source.passwordVerifier, passwordVerifierBytes) ? source.passwordVerifier : undefined;
    const hasUsableVerifier = source.hasPassword === true && passwordSalt !== undefined && passwordVerifier !== undefined;

    // A V1 passwordless room must never reopen without the owner choosing a new password.
    const room: StoredRoomConfig = {
      schemaVersion: roomConfigSchemaVersion,
      id: source.id,
      name,
      createdAt,
      capacity: roomMaxCapacity,
      hasPassword: hasUsableVerifier,
      needsPassword: !hasUsableVerifier,
      ...(hasUsableVerifier ? { passwordSalt, passwordVerifier } : {}),
    };

    const migrated = source.schemaVersion !== roomConfigSchemaVersion
      || source.name !== name
      || source.createdAt !== createdAt
      || source.capacity !== roomMaxCapacity
      || source.hasPassword !== room.hasPassword
      || source.needsPassword !== room.needsPassword
      || source.passwordSalt !== room.passwordSalt
      || source.passwordVerifier !== room.passwordVerifier;
    return { room, migrated };
  }

  private async read(): Promise<StoredRoomConfig | undefined> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch {
      return undefined;
    }

    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      return undefined;
    }
    const normalized = await this.normalize(value);
    if (!normalized) return undefined;
    if (normalized.migrated) await this.write(normalized.room);
    return normalized.room;
  }

  private async write(room: StoredRoomConfig): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(room), { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async get(): Promise<RoomConfigV2 | undefined> {
    const room = await this.read();
    return room && publicRoom(room);
  }

  async create(name: string, password: string): Promise<RoomConfigV2> {
    const cleanName = name.trim().slice(0, 48);
    if (!cleanName) throw new Error('Informe um nome para a sala.');
    if (password.length < 4 || password.length > 128) throw new Error('A senha deve ter entre 4 e 128 caracteres.');
    const salt = randomBytes(passwordSaltBytes);
    const verifier = scryptSync(password, salt, passwordVerifierBytes);
    const room: StoredRoomConfig = {
      schemaVersion: roomConfigSchemaVersion,
      id: randomBytes(16).toString('hex'),
      name: cleanName,
      createdAt: new Date().toISOString(),
      capacity: roomMaxCapacity,
      hasPassword: true,
      needsPassword: false,
      passwordSalt: salt.toString('base64'),
      passwordVerifier: verifier.toString('base64'),
    };
    await this.write(room);
    return publicRoom(room);
  }

  async updatePassword(password: string): Promise<RoomConfigV2> {
    const room = await this.read();
    if (!room) throw new Error('Crie uma sala antes de definir uma senha.');
    if (password.length < 4 || password.length > 128) throw new Error('A senha deve ter entre 4 e 128 caracteres.');
    const salt = randomBytes(passwordSaltBytes);
    room.passwordSalt = salt.toString('base64');
    room.passwordVerifier = scryptSync(password, salt, passwordVerifierBytes).toString('base64');
    room.hasPassword = true;
    room.needsPassword = false;
    await this.write(room);
    return publicRoom(room);
  }

  /**
   * Retained for the existing IPC API. Rooms are no longer allowed to host
   * passwordless: this clears the verifier and marks the room for a reset.
   */
  async removePassword(): Promise<RoomConfigV2> {
    const room = await this.read();
    if (!room) throw new Error('Nenhuma sala foi criada.');
    delete room.passwordSalt;
    delete room.passwordVerifier;
    room.hasPassword = false;
    room.needsPassword = true;
    await this.write(room);
    return publicRoom(room);
  }

  async delete(): Promise<void> {
    await rm(this.filePath, { force: true });
  }

  async verifyPassword(password: string): Promise<boolean> {
    const room = await this.read();
    if (!room || !room.hasPassword || room.needsPassword || !room.passwordSalt || !room.passwordVerifier) return false;
    const expected = Buffer.from(room.passwordVerifier, 'base64');
    const actual = scryptSync(password, Buffer.from(room.passwordSalt, 'base64'), passwordVerifierBytes);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
