import { screen } from 'electron';
import { exec } from 'node:child_process';
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
  private isInjecting = false;

  constructor() {
    this.startPhysicalMouseMonitor();
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
      if (!this.config.enabled || this.isInjecting) return;
      try {
        if (!screen.getCursorScreenPoint) return;
        const current = screen.getCursorScreenPoint();
        if (!this.lastPhysicalPos) {
          this.lastPhysicalPos = current;
          return;
        }

        const dist = Math.hypot(current.x - this.lastPhysicalPos.x, current.y - this.lastPhysicalPos.y);
        this.lastPhysicalPos = current;

        // If physical mouse moved by more than 8 pixels:
        if (dist > 8) {
          this.triggerHostOverride();
        }
      } catch {
        // Ignored in test environment
      }
    }, 80);
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

    this.isInjecting = true;
    try {
      this.injectNative(input, displayBounds);
    } finally {
      setTimeout(() => {
        this.isInjecting = false;
        try {
          if (screen.getCursorScreenPoint) {
            this.lastPhysicalPos = screen.getCursorScreenPoint();
          }
        } catch {
          // Ignored
        }
      }, 30);
    }

    return true;
  }

  private injectNative(input: RemoteInputPayload, bounds: { x: number; y: number; width: number; height: number }): void {
    if (process.platform !== 'win32') return;

    if (input.kind === 'mouse-move') {
      const targetX = bounds.x + Math.round(Math.max(0, Math.min(1, input.x)) * bounds.width);
      const targetY = bounds.y + Math.round(Math.max(0, Math.min(1, input.y)) * bounds.height);
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY})`;
      exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 800 }, () => {});
      return;
    }

    if (input.kind === 'mouse-down' || input.kind === 'mouse-up') {
      const targetX = bounds.x + Math.round(Math.max(0, Math.min(1, input.x)) * bounds.width);
      const targetY = bounds.y + Math.round(Math.max(0, Math.min(1, input.y)) * bounds.height);
      let flag = 0;
      if (input.button === 'left') flag = input.kind === 'mouse-down' ? 2 : 4; // MOUSEEVENTF_LEFTDOWN = 2, LEFTUP = 4
      else if (input.button === 'right') flag = input.kind === 'mouse-down' ? 8 : 16; // MOUSEEVENTF_RIGHTDOWN = 8, RIGHTUP = 16
      else if (input.button === 'middle') flag = input.kind === 'mouse-down' ? 32 : 64; // MOUSEEVENTF_MIDDLEDOWN = 32, MIDDLEUP = 64

      const psScript = `
        $code = '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra);';
        $type = Add-Type -MemberDefinition $code -Name 'Win32Mouse' -Namespace 'SFScreen' -PassThru;
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${targetX}, ${targetY});
        $type::mouse_event(${flag}, 0, 0, 0, 0);
      `.replace(/\r?\n\s*/g, ' ');
      exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 800 }, () => {});
      return;
    }

    if (input.kind === 'mouse-wheel') {
      const delta = input.deltaY < 0 ? 120 : -120;
      const psScript = `
        $code = '[DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra);';
        $type = Add-Type -MemberDefinition $code -Name 'Win32Wheel' -Namespace 'SFScreen' -PassThru;
        $type::mouse_event(2048, 0, 0, ${delta}, 0);
      `.replace(/\r?\n\s*/g, ' ');
      exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 800 }, () => {});
      return;
    }

    if (input.kind === 'key-down' && input.key) {
      const safeKey = input.key.length === 1 ? input.key : `{${input.key.toUpperCase()}}`;
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safeKey.replace(/'/g, "''")}')`;
      exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 800 }, () => {});
      return;
    }
  }

  destroy(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.clearOverride();
    this.statusListeners.clear();
  }
}
