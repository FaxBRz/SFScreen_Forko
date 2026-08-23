import { app, screen } from 'electron';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RemoteControlConfig, RemoteControlStatus, RemoteInputPayload } from '../../shared/session/media-control';

export class RemoteInputService {
  private config: RemoteControlConfig = {
    enabled: false,
    allowMouse: false,
    allowKeyboard: false,
    allowClipboard: false,
  };

  private isHostOverriding = false;
  private overrideTimeout: NodeJS.Timeout | null = null;
  private statusListeners = new Set<(status: { state: RemoteControlStatus; timeoutMs?: number }) => void>();
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastPhysicalPos: { x: number; y: number } | null = null;
  private lastInjectedPos: { x: number; y: number; time: number } | null = null;
  private helperProcess: ChildProcess | null = null;
  private helperReady = false;

  constructor() {
    this.initNativeHelper();
    this.startPhysicalMouseMonitor();
  }

  private initNativeHelper(): void {
    if (process.platform !== 'win32') return;

    try {
      const helperExe = this.getOrCompileHelperExe();
      if (!helperExe || !fs.existsSync(helperExe)) return;

      this.helperProcess = spawn(helperExe, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.helperProcess.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        if (text.includes('READY') || text.includes('PONG')) {
          this.helperReady = true;
        }
      });

      this.helperProcess.on('exit', () => {
        this.helperReady = false;
        this.helperProcess = null;
      });

      this.helperProcess.stdin?.write('PING\n');
    } catch {
      // Ignored in test environment
    }
  }

  private getOrCompileHelperExe(): string | null {
    try {
      const userData = app?.getPath ? app.getPath('userData') : process.env.TEMP || process.cwd();
      const targetExe = path.join(userData, 'sfscreen-input-helper.exe');

      if (fs.existsSync(targetExe)) {
        return targetExe;
      }

      const possibleCsPaths = [
        path.join(__dirname, 'native-input-helper.cs'),
        path.join(__dirname, '..', 'src', 'main', 'input', 'native-input-helper.cs'),
        path.join(process.cwd(), 'src', 'main', 'input', 'native-input-helper.cs'),
      ];

      const csFile = possibleCsPaths.find((p) => fs.existsSync(p));
      if (!csFile) return null;

      const cscPaths = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
      ];
      const cscExe = cscPaths.find((p) => fs.existsSync(p));
      if (!cscExe) return null;

      execSync(`"${cscExe}" /nologo /optimize /target:exe /out:"${targetExe}" "${csFile}"`, { timeout: 5000 });
      return targetExe;
    } catch {
      return null;
    }
  }

  private sendCommand(cmd: string): void {
    if (this.helperProcess && this.helperProcess.stdin && !this.helperProcess.killed) {
      try {
        this.helperProcess.stdin.write(`${cmd}\n`);
      } catch {
        // Ignored
      }
    }
  }

  setConfig(config: RemoteControlConfig): void {
    this.config = { ...config };
    if (!config.enabled) {
      this.clearOverride();
      this.notifyStatus('disabled');
    } else {
      this.notifyStatus(this.isHostOverriding ? 'paused-by-host' : 'active', this.isHostOverriding ? 5000 : undefined);
    }
  }

  getConfig(): RemoteControlConfig {
    return { ...this.config };
  }

  onStatus(listener: (status: { state: RemoteControlStatus; timeoutMs?: number }) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(state: RemoteControlStatus, timeoutMs?: number): void {
    const payload = { state, timeoutMs };
    for (const listener of this.statusListeners) {
      try {
        listener(payload);
      } catch {
        // Ignored
      }
    }
  }

  private startPhysicalMouseMonitor(): void {
    if (this.monitorInterval) return;
    try {
      this.lastPhysicalPos = screen.getCursorScreenPoint ? screen.getCursorScreenPoint() : null;
    } catch {
      this.lastPhysicalPos = null;
    }

    this.monitorInterval = setInterval(() => {
      if (!this.config.enabled) return;
      try {
        if (!screen.getCursorScreenPoint) return;
        const current = screen.getCursorScreenPoint();
        if (!this.lastPhysicalPos) {
          this.lastPhysicalPos = current;
          return;
        }

        const now = Date.now();
        // If there was a recent remote injection, check if the current cursor position matches the injected position
        if (this.lastInjectedPos && now - this.lastInjectedPos.time < 200) {
          const distToInjected = Math.hypot(current.x - this.lastInjectedPos.x, current.y - this.lastInjectedPos.y);
          if (distToInjected < 20) {
            // Movement was caused by remote injection, update reference without triggering host override
            this.lastPhysicalPos = current;
            return;
          }
        }

        const dist = Math.hypot(current.x - this.lastPhysicalPos.x, current.y - this.lastPhysicalPos.y);
        this.lastPhysicalPos = current;

        // If physical mouse moved independently by more than 12 pixels:
        if (dist > 12) {
          this.triggerHostOverride();
        }
      } catch {
        // Ignored in test environment
      }
    }, 60);
  }

  triggerHostOverride(): void {
    if (!this.config.enabled) return;
    this.isHostOverriding = true;
    this.notifyStatus('paused-by-host', 5000);

    if (this.overrideTimeout) clearTimeout(this.overrideTimeout);
    this.overrideTimeout = setTimeout(() => {
      this.isHostOverriding = false;
      this.overrideTimeout = null;
      if (this.config.enabled) {
        this.notifyStatus('active');
      }
    }, 5000);
  }

  resumeHostOverride(): void {
    this.clearOverride();
    if (this.config.enabled) {
      this.notifyStatus('active');
    }
  }

  private clearOverride(): void {
    if (this.overrideTimeout) {
      clearTimeout(this.overrideTimeout);
      this.overrideTimeout = null;
    }
    this.isHostOverriding = false;
  }

  executeInput(input: RemoteInputPayload, sourceId?: string): boolean {
    if (!this.config.enabled || this.isHostOverriding) {
      return false;
    }

    if (input.kind.startsWith('mouse') && !this.config.allowMouse) {
      return false;
    }

    if ((input.kind.startsWith('key') || input.kind === 'special') && !this.config.allowKeyboard) {
      return false;
    }

    // Resolve target display bounds
    let displayBounds = { x: 0, y: 0, width: 1920, height: 1080 };
    try {
      const displays = screen.getAllDisplays ? screen.getAllDisplays() : [];
      const matched = sourceId ? displays.find((d) => String(d.id) === sourceId) : undefined;
      const target = matched || (screen.getPrimaryDisplay ? screen.getPrimaryDisplay() : displays[0]);
      if (target) {
        displayBounds = target.bounds;
      }
    } catch {
      // Ignored
    }

    this.injectNative(input, displayBounds);
    return true;
  }

  private injectNative(input: RemoteInputPayload, bounds: { x: number; y: number; width: number; height: number }): void {
    if (process.platform !== 'win32') return;

    if (input.kind === 'mouse-move') {
      const targetX = bounds.x + Math.round(Math.max(0, Math.min(1, input.x)) * bounds.width);
      const targetY = bounds.y + Math.round(Math.max(0, Math.min(1, input.y)) * bounds.height);
      this.lastInjectedPos = { x: targetX, y: targetY, time: Date.now() };
      this.sendCommand(`M ${targetX} ${targetY}`);
      return;
    }

    if (input.kind === 'mouse-down' || input.kind === 'mouse-up') {
      const targetX = bounds.x + Math.round(Math.max(0, Math.min(1, input.x)) * bounds.width);
      const targetY = bounds.y + Math.round(Math.max(0, Math.min(1, input.y)) * bounds.height);
      this.lastInjectedPos = { x: targetX, y: targetY, time: Date.now() };
      const btn = input.button === 'right' ? 2 : input.button === 'middle' ? 3 : 1;
      const cmd = input.kind === 'mouse-down' ? 'D' : 'U';
      this.sendCommand(`${cmd} ${btn} ${targetX} ${targetY}`);
      return;
    }

    if (input.kind === 'mouse-wheel') {
      const targetX = bounds.x + Math.round(Math.max(0, Math.min(1, input.x)) * bounds.width);
      const targetY = bounds.y + Math.round(Math.max(0, Math.min(1, input.y)) * bounds.height);
      this.lastInjectedPos = { x: targetX, y: targetY, time: Date.now() };
      const delta = input.deltaY < 0 ? 120 : -120;
      this.sendCommand(`W ${delta} ${targetX} ${targetY}`);
      return;
    }

    if (input.kind === 'key-down' || input.kind === 'key-up') {
      const vk = this.mapCodeToVk(input.code, input.key);
      if (vk) {
        const isExtended = this.isExtendedKey(vk) ? 1 : 0;
        const cmd = input.kind === 'key-down' ? 'KD' : 'KU';
        this.sendCommand(`${cmd} ${vk} ${isExtended}`);
      }
      return;
    }

    if (input.kind === 'special') {
      if (input.action === 'win') {
        this.sendCommand('WIN');
      } else if (input.action === 'ctrl-alt-del') {
        this.sendCommand('CAD');
      }
    }
  }

  private isExtendedKey(vk: number): boolean {
    return (
      vk === 0xA3 || // RCtrl
      vk === 0xA5 || // RAlt
      vk === 0x5B || // LWin
      vk === 0x5C || // RWin
      vk === 0x21 || // PgUp
      vk === 0x22 || // PgDn
      vk === 0x23 || // End
      vk === 0x24 || // Home
      vk === 0x25 || // Left
      vk === 0x26 || // Up
      vk === 0x27 || // Right
      vk === 0x28 || // Down
      vk === 0x2D || // Insert
      vk === 0x2E    // Delete
    );
  }

  private mapCodeToVk(code?: string, key?: string): number | null {
    if (!code && !key) return null;

    if (code) {
      if (code.startsWith('Key') && code.length === 4) {
        return code.charCodeAt(3); // 'KeyA' -> 0x41
      }
      if (code.startsWith('Digit') && code.length === 6) {
        return code.charCodeAt(5); // 'Digit0' -> 0x30
      }
      if (code.startsWith('Numpad') && code.length === 7) {
        const d = parseInt(code[6], 10);
        if (!Number.isNaN(d)) return 0x60 + d;
      }
      if (code.startsWith('F') && code.length <= 3) {
        const fNum = parseInt(code.substring(1), 10);
        if (fNum >= 1 && fNum <= 24) return 0x70 + (fNum - 1);
      }

      const map: Record<string, number> = {
        Space: 0x20,
        Enter: 0x0D,
        NumpadEnter: 0x0D,
        Backspace: 0x08,
        Tab: 0x09,
        Escape: 0x1B,
        ShiftLeft: 0xA0,
        ShiftRight: 0xA1,
        ControlLeft: 0xA2,
        ControlRight: 0xA3,
        AltLeft: 0xA4,
        AltRight: 0xA5,
        MetaLeft: 0x5B,
        MetaRight: 0x5C,
        CapsLock: 0x14,
        ArrowLeft: 0x25,
        ArrowUp: 0x26,
        ArrowRight: 0x27,
        ArrowDown: 0x28,
        Delete: 0x2E,
        Insert: 0x2D,
        Home: 0x24,
        End: 0x23,
        PageUp: 0x21,
        PageDown: 0x22,
        Equal: 0xBB,
        Minus: 0xBD,
        BracketLeft: 0xDB,
        BracketRight: 0xDD,
        Semicolon: 0xBA,
        Quote: 0xDE,
        Backquote: 0xC0,
        Comma: 0xBC,
        Period: 0xBE,
        Slash: 0xBF,
        Backslash: 0xDC,
      };

      if (map[code]) return map[code];
    }

    if (key && key.length === 1) {
      const upper = key.toUpperCase();
      return upper.charCodeAt(0);
    }

    return null;
  }

  destroy(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.clearOverride();
    this.statusListeners.clear();

    if (this.helperProcess) {
      try {
        this.helperProcess.kill();
      } catch {
        // Ignored
      }
      this.helperProcess = null;
    }
  }
}
