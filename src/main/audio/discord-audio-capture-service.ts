import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { FilteredAudioStart } from '../../shared/session/types';

const execFileAsync = promisify(execFile);

interface ProcessEntry {
  ProcessId: number;
  ParentProcessId: number;
}

interface NativeLoopbackCapture {
  start: (processId: number, includeProcessTree: boolean, listener: (chunk: Buffer) => void) => unknown;
  stop: () => void;
}

type NativeLoopbackConstructor = new () => NativeLoopbackCapture;

interface NativeLoopbackModule {
  LoopbackCapture?: NativeLoopbackConstructor;
  default?: { LoopbackCapture?: NativeLoopbackConstructor };
}

const normalizeProcesses = (value: unknown): ProcessEntry[] => {
  const values = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return values.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const processId = Number(record.ProcessId);
    const parentProcessId = Number(record.ParentProcessId);
    return Number.isInteger(processId) && processId > 0 && Number.isInteger(parentProcessId)
      ? [{ ProcessId: processId, ParentProcessId: parentProcessId }]
      : [];
  });
};

const descendantCount = (root: number, children: ReadonlyMap<number, number[]>): number => {
  let count = 0;
  const pending = [...(children.get(root) ?? [])];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    count += 1;
    pending.push(...(children.get(current) ?? []));
  }
  return count;
};

const findDiscordRootPid = async (): Promise<number | undefined> => {
  const script = [
    "$names = @('Discord.exe','DiscordCanary.exe','DiscordPTB.exe')",
    "$items = @(Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name } | Select-Object ProcessId,ParentProcessId)",
    "if ($items.Count -eq 0) { Write-Output '[]' } else { $items | ConvertTo-Json -Compress }",
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ], { windowsHide: true, timeout: 5_000, maxBuffer: 128 * 1024 });

  const processes = normalizeProcesses(JSON.parse(stdout.trim() || '[]'));
  if (processes.length === 0) return undefined;

  const ids = new Set(processes.map((process) => process.ProcessId));
  const children = new Map<number, number[]>();
  for (const process of processes) {
    const list = children.get(process.ParentProcessId) ?? [];
    list.push(process.ProcessId);
    children.set(process.ParentProcessId, list);
  }

  const roots = processes.filter((process) => !ids.has(process.ParentProcessId));
  const candidates = roots.length > 0 ? roots : processes;
  candidates.sort((left, right) => descendantCount(right.ProcessId, children) - descendantCount(left.ProcessId, children));
  return candidates[0]?.ProcessId;
};

const loadNativeCapture = (): NativeLoopbackConstructor => {
  // Kept as a runtime require so Vite leaves the N-API binary outside the JS bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('loopback-capture') as NativeLoopbackModule;
  const constructor = module.LoopbackCapture ?? module.default?.LoopbackCapture;
  if (!constructor) throw new Error('O módulo loopback-capture não expôs LoopbackCapture.');
  return constructor;
};

export class DiscordAudioCaptureService {
  private current?: { captureId: string; capture: NativeLoopbackCapture };

  async start(listener: (chunk: Buffer) => void): Promise<FilteredAudioStart> {
    this.stop();
    if (process.platform !== 'win32') throw new Error('O filtro de áudio por processo só está disponível no Windows.');

    const discordPid = await findDiscordRootPid();
    if (discordPid === undefined) return { mode: 'not-needed', sampleRate: 48000, channels: 2 };

    const Capture = loadNativeCapture();
    const capture = new Capture();
    const captureId = randomUUID();

    try {
      // false maps to PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE in loopback-capture.
      capture.start(discordPid, false, (chunk) => {
        if (this.current?.captureId !== captureId || chunk.length === 0) return;
        listener(chunk);
      });
    } catch (error) {
      try { capture.stop(); } catch { /* ignore cleanup errors */ }
      throw error;
    }

    this.current = { captureId, capture };
    return { mode: 'filtered', sampleRate: 48000, channels: 2, captureId };
  }

  stop(captureId?: string): void {
    if (!this.current) return;
    if (captureId !== undefined && captureId !== this.current.captureId) return;
    const current = this.current;
    this.current = undefined;
    try { current.capture.stop(); } catch { /* capture may already be stopped */ }
  }
}
