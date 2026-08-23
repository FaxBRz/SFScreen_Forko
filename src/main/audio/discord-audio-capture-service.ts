import { app } from 'electron';
import { execFile, execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AudioApplication, FilteredAudioStart } from '../../shared/session/types';

const execFileAsync = promisify(execFile);
const processRefreshMs = 5_000;
const mixIntervalMs = 20;
const mixFrames = 960;
const maxQueuedBytes = 48_000 * 2 * 2;
const discordAliases = ['discord.exe', 'discordcanary.exe', 'discordptb.exe'];

interface NativeLoopbackCapture {
  start: (processId: number, includeProcessTree: boolean, listener: (chunk: Buffer) => void) => unknown;
  stop: () => void;
}
type NativeLoopbackConstructor = new () => NativeLoopbackCapture;
interface NativeLoopbackModule {
  LoopbackCapture?: NativeLoopbackConstructor;
  default?: { LoopbackCapture?: NativeLoopbackConstructor };
}

class PcmQueue {
  private chunks: Buffer[] = [];
  private offset = 0;
  private size = 0;

  write(chunk: Buffer): void {
    if (chunk.length < 2) return;
    const copy = Buffer.from(chunk.subarray(0, chunk.length - (chunk.length % 2)));
    this.chunks.push(copy);
    this.size += copy.length;
    while (this.size > maxQueuedBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift();
      if (!removed) break;
      this.size -= removed.length - this.offset;
      this.offset = 0;
    }
  }

  readSample(): number {
    const first = this.chunks[0];
    if (!first || this.offset + 1 >= first.length) return 0;
    const sample = first.readInt16LE(this.offset);
    this.offset += 2;
    this.size -= 2;
    if (this.offset >= first.length) {
      this.chunks.shift();
      this.offset = 0;
    }
    return sample;
  }

  get available(): boolean { return this.size >= 2; }
}

interface CaptureSource { capture: NativeLoopbackCapture; queue?: PcmQueue }
interface ActiveCapture {
  captureId: string;
  listener: (chunk: Buffer) => void;
  excluded: string[];
  signature: string;
  sources: CaptureSource[];
  refreshTimer?: NodeJS.Timeout;
  mixTimer?: NodeJS.Timeout;
  switching: boolean;
}
interface CapturePlan {
  signature: string;
  allowed: AudioApplication[];
}
interface RunningProcess {
  processId: number;
  parentProcessId: number;
  executable: string;
}

const normalizeExecutable = (value: string): string => {
  const executable = value.trim().replaceAll('\\', '/').split('/').pop()?.toLowerCase() ?? '';
  if (!/^[a-z0-9][a-z0-9._+ -]{0,79}(?:\.exe)?$/i.test(executable)) return '';
  return executable.endsWith('.exe') ? executable : `${executable}.exe`;
};

const normalizeExclusions = (values?: readonly string[]): string[] => {
  const normalized = [...new Set((values ?? ['discord.exe']).map(normalizeExecutable).filter(Boolean))].slice(0, 32);
  return normalized.flatMap((name) => name === 'discord.exe' ? discordAliases : [name]);
};

const loadNativeCapture = (): NativeLoopbackConstructor => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('loopback-capture') as NativeLoopbackModule;
  const constructor = module.LoopbackCapture ?? module.default?.LoopbackCapture;
  if (!constructor) throw new Error('O módulo loopback-capture não expôs LoopbackCapture.');
  return constructor;
};

const stopNative = (capture: NativeLoopbackCapture): void => {
  try { capture.stop(); } catch { /* Capture may already be stopped. */ }
};

const isAudioApplication = (value: unknown): value is AudioApplication => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return Number.isInteger(item.processId) && Number(item.processId) > 0 && typeof item.executable === 'string' && typeof item.label === 'string';
};

export class DiscordAudioCaptureService {
  private current?: ActiveCapture;

  async listApplications(): Promise<AudioApplication[]> {
    if (process.platform !== 'win32') return [];
    const helper = this.getOrCompileSessionHelper();
    if (!helper) return [];
    try {
      const { stdout } = await execFileAsync(helper, [], { windowsHide: true, timeout: 8_000, maxBuffer: 512 * 1024 });
      const parsed = JSON.parse(stdout.trim() || '[]') as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isAudioApplication).map((item) => ({
        processId: item.processId,
        executable: normalizeExecutable(item.executable),
        label: item.label.trim() || item.executable,
      })).filter((item) => Boolean(item.executable)).sort((left, right) => left.label.localeCompare(right.label));
    } catch {
      return [];
    }
  }

  async start(listener: (chunk: Buffer) => void, excludedExecutables?: readonly string[]): Promise<FilteredAudioStart> {
    this.stop();
    if (process.platform !== 'win32') throw new Error('O filtro de áudio por processo só está disponível no Windows.');
    const captureId = randomUUID();
    const excluded = normalizeExclusions(excludedExecutables);
    const active = await this.createCapture(captureId, listener, excluded);
    this.current = active;
    active.refreshTimer = setInterval(() => { void this.refreshCapture(captureId); }, processRefreshMs);
    return { mode: 'filtered', sampleRate: 48000, channels: 2, captureId };
  }

  stop(captureId?: string): void {
    const active = this.current;
    if (!active || (captureId !== undefined && captureId !== active.captureId)) return;
    this.current = undefined;
    this.disposeCapture(active);
  }

  private async createCapture(captureId: string, listener: (chunk: Buffer) => void, excluded: string[], preparedPlan?: CapturePlan): Promise<ActiveCapture> {
    const Capture = loadNativeCapture();
    const plan = preparedPlan ?? await this.resolvePlan(excluded);
    const { allowed, signature } = plan;

    const sources: CaptureSource[] = [];
    for (const application of allowed) {
      const capture = new Capture();
      const queue = new PcmQueue();
      try {
        capture.start(application.processId, true, (chunk) => queue.write(chunk));
        sources.push({ capture, queue });
      } catch {
        stopNative(capture);
      }
    }
    const active: ActiveCapture = { captureId, listener, excluded, signature, sources, switching: false };
    active.mixTimer = setInterval(() => {
      if (this.current && this.current !== active) return;
      const queues = active.sources.flatMap((source) => source.queue ? [source.queue] : []);
      if (!queues.some((queue) => queue.available)) return;
      const output = Buffer.allocUnsafe(mixFrames * 2 * 2);
      for (let sampleIndex = 0; sampleIndex < mixFrames * 2; sampleIndex += 1) {
        let mixed = 0;
        for (const queue of queues) mixed += queue.readSample();
        output.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), sampleIndex * 2);
      }
      listener(output);
    }, mixIntervalMs);
    return active;
  }

  private async resolvePlan(excluded: string[]): Promise<CapturePlan> {
    // Application Loopback only gives us a safe exclusion boundary when we
    // capture known process trees. Never use the unrestricted system loopback:
    // it can capture SFScreen's own playback and turn voice into screen audio.
    const helper = this.getOrCompileSessionHelper();
    if (!helper) {
      throw new Error('Não foi possível garantir a exclusão do áudio do SFScreen neste Windows. O áudio da transmissão foi desativado para evitar vazamento do microfone.');
    }
    const applications = await this.listApplicationsFromHelper(helper);
    const excludedRoots = await this.listExcludedProcessRoots(excluded);
    const knownIds = new Set(applications.map((item) => item.processId));
    for (const root of excludedRoots) {
      if (!knownIds.has(root.processId)) applications.push({ processId: root.processId, executable: root.executable, label: root.executable.replace(/\.exe$/i, '') });
    }
    const ignoredOwnExecutable = app.isPackaged ? 'sfscreen.exe' : 'electron.exe';
    const excludedSet = new Set([...excluded, ignoredOwnExecutable]);
    const allowed = applications.filter((item) => !excludedSet.has(item.executable));
    const blocked = applications.filter((item) => excludedSet.has(item.executable));
    const signature = `mix:${allowed.map((item) => item.processId).sort((a, b) => a - b).join(',')}|blocked:${blocked.map((item) => item.processId).sort((a, b) => a - b).join(',')}`;
    return { allowed, signature };
  }

  private async listApplicationsFromHelper(helper: string): Promise<AudioApplication[]> {
    try {
      const { stdout } = await execFileAsync(helper, [], { windowsHide: true, timeout: 8_000, maxBuffer: 512 * 1024 });
      const parsed = JSON.parse(stdout.trim() || '[]') as unknown;
      if (!Array.isArray(parsed)) throw new Error('O enumerador de sessões de áudio retornou dados inválidos.');
      return parsed.filter(isAudioApplication).map((item) => ({
        processId: item.processId,
        executable: normalizeExecutable(item.executable),
        label: item.label.trim() || item.executable,
      })).filter((item) => Boolean(item.executable)).sort((left, right) => left.label.localeCompare(right.label));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Não foi possível enumerar as sessões de áudio para uma captura segura.');
    }
  }

  private async listExcludedProcessRoots(excluded: string[]): Promise<RunningProcess[]> {
    if (excluded.length === 0) return [];
    const names = excluded.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');
    const script = [
      `$names = @(${names})`,
      "$items = @(Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name.ToLowerInvariant() } | Select-Object ProcessId,ParentProcessId,Name)",
      "if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress }",
    ].join('; ');
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5_000, maxBuffer: 256 * 1024 });
      const parsed = JSON.parse(stdout.trim() || '[]') as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      const processes = values.flatMap((value): RunningProcess[] => {
        if (!value || typeof value !== 'object') return [];
        const item = value as Record<string, unknown>;
        const processId = Number(item.ProcessId);
        const parentProcessId = Number(item.ParentProcessId);
        const executable = normalizeExecutable(String(item.Name ?? ''));
        return Number.isInteger(processId) && processId > 0 && Number.isInteger(parentProcessId) && executable
          ? [{ processId, parentProcessId, executable }]
          : [];
      });
      const idsByExecutable = new Map<string, Set<number>>();
      for (const processEntry of processes) {
        const ids = idsByExecutable.get(processEntry.executable) ?? new Set<number>();
        ids.add(processEntry.processId);
        idsByExecutable.set(processEntry.executable, ids);
      }
      return processes.filter((processEntry) => !idsByExecutable.get(processEntry.executable)?.has(processEntry.parentProcessId));
    } catch {
      return [];
    }
  }

  private async refreshCapture(captureId: string): Promise<void> {
    const active = this.current;
    if (!active || active.captureId !== captureId || active.switching) return;
    active.switching = true;
    try {
      const plan = await this.resolvePlan(active.excluded);
      if (plan.signature === active.signature) return;
      const replacement = await this.createCapture(captureId, active.listener, active.excluded, plan);
      const current = this.current;
      if (!current || current.captureId !== captureId) {
        this.disposeCapture(replacement);
        return;
      }
      replacement.refreshTimer = current.refreshTimer;
      this.current = replacement;
      current.refreshTimer = undefined;
      this.disposeCapture(current);
    } catch {
      // Keep the existing capture and retry when applications change again.
    } finally {
      if (this.current?.captureId === captureId) this.current.switching = false;
    }
  }

  private disposeCapture(active: ActiveCapture): void {
    if (active.refreshTimer) clearInterval(active.refreshTimer);
    if (active.mixTimer) clearInterval(active.mixTimer);
    for (const source of active.sources) stopNative(source.capture);
  }

  private getOrCompileSessionHelper(): string | undefined {
    try {
      const possibleSources = [
        path.join(__dirname, 'audio-session-helper.cs'),
        path.join(__dirname, '..', 'src', 'main', 'audio', 'audio-session-helper.cs'),
        path.join(process.cwd(), 'src', 'main', 'audio', 'audio-session-helper.cs'),
      ];
      const source = possibleSources.find((candidate) => fs.existsSync(candidate));
      if (!source) return undefined;
      const hash = createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0, 12);
      const output = path.join(app.getPath('userData'), `sfscreen-audio-sessions-${hash}.exe`);
      if (fs.existsSync(output)) return output;
      const compiler = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
      ].find((candidate) => fs.existsSync(candidate));
      if (!compiler) return undefined;
      execSync(`"${compiler}" /nologo /optimize /target:exe /out:"${output}" "${source}"`, { timeout: 8_000, windowsHide: true });
      return output;
    } catch {
      return undefined;
    }
  }
}
