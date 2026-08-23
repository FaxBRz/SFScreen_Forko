import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface LocalRoomConfig {
  id: string;
  name: string;
  hasPassword: boolean;
}

interface StoredRoomConfig extends LocalRoomConfig {
  passwordSalt?: string;
  passwordVerifier?: string;
}

const configFileName = 'room-config.json';

/** Local-only room metadata. Chat, files and member presence are never written here. */
export class RoomConfigService {
  constructor(private readonly dataDirectory: string) {}

  private get filePath(): string {
    return path.join(this.dataDirectory, configFileName);
  }

  private async read(): Promise<StoredRoomConfig | undefined> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const value: unknown = JSON.parse(content);
      if (!value || typeof value !== 'object') return undefined;
      const room = value as Partial<StoredRoomConfig>;
      if (typeof room.id !== 'string' || typeof room.name !== 'string' || typeof room.hasPassword !== 'boolean') return undefined;
      return room as StoredRoomConfig;
    } catch {
      return undefined;
    }
  }

  private async write(room: StoredRoomConfig): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(room), { encoding: 'utf8', mode: 0o600 });
  }

  async get(): Promise<LocalRoomConfig | undefined> {
    const room = await this.read();
    return room && { id: room.id, name: room.name, hasPassword: room.hasPassword };
  }

  async create(name: string, password: string): Promise<LocalRoomConfig> {
    const cleanName = name.trim().slice(0, 48);
    if (!cleanName) throw new Error('Informe um nome para a sala.');
    if (password.length < 4 || password.length > 128) throw new Error('A senha deve ter entre 4 e 128 caracteres.');
    const salt = randomBytes(16);
    const verifier = scryptSync(password, salt, 32);
    const room: StoredRoomConfig = {
      id: randomBytes(16).toString('hex'),
      name: cleanName,
      hasPassword: true,
      passwordSalt: salt.toString('base64'),
      passwordVerifier: verifier.toString('base64'),
    };
    await this.write(room);
    return { id: room.id, name: room.name, hasPassword: true };
  }

  async updatePassword(password: string): Promise<LocalRoomConfig> {
    const room = await this.read();
    if (!room) throw new Error('Crie uma sala antes de definir uma senha.');
    if (password.length < 4 || password.length > 128) throw new Error('A senha deve ter entre 4 e 128 caracteres.');
    const salt = randomBytes(16);
    room.passwordSalt = salt.toString('base64');
    room.passwordVerifier = scryptSync(password, salt, 32).toString('base64');
    room.hasPassword = true;
    await this.write(room);
    return { id: room.id, name: room.name, hasPassword: true };
  }

  async removePassword(): Promise<LocalRoomConfig> {
    const room = await this.read();
    if (!room) throw new Error('Nenhuma sala foi criada.');
    delete room.passwordSalt;
    delete room.passwordVerifier;
    room.hasPassword = false;
    await this.write(room);
    return { id: room.id, name: room.name, hasPassword: false };
  }

  async verifyPassword(password: string): Promise<boolean> {
    const room = await this.read();
    if (!room) return false;
    if (!room.hasPassword) return true;
    if (!room.passwordSalt || !room.passwordVerifier) return false;
    const expected = Buffer.from(room.passwordVerifier, 'base64');
    const actual = scryptSync(password, Buffer.from(room.passwordSalt, 'base64'), 32);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
