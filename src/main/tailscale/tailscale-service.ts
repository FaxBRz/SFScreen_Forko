import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isTailscaleIp } from '../../shared/session/network';
import type { TailscalePeer, TailscaleRoute, TailscaleStatus } from '../../shared/session/types';

const execFileAsync = promisify(execFile);

export interface RawPeer {
  ID?: string;
  DNSName?: string;
  HostName?: string;
  TailscaleIPs?: string[];
  Online?: boolean;
  CurAddr?: string;
  Relay?: string;
  PeerRelay?: string;
}

export interface RawStatus {
  BackendState?: string;
  Self?: RawPeer;
  Peer?: Record<string, RawPeer>;
}

const executableCandidates = ['tailscale.exe', 'C:\\Program Files\\Tailscale\\tailscale.exe'];

const findExecutable = async (): Promise<string | undefined> => {
  for (const executable of executableCandidates) {
    try {
      await execFileAsync(executable, ['version'], { windowsHide: true, timeout: 3_000 });
      return executable;
    } catch {
      // Try the next known location without exposing command output.
    }
  }
  return undefined;
};

const routeFor = (peer: RawPeer): TailscaleRoute => {
  if (peer.PeerRelay) return 'peer-relay';
  if (peer.Relay) return 'relay';
  if (peer.CurAddr) return 'direct';
  return 'unknown';
};

const peerFrom = (peer: RawPeer): TailscalePeer | undefined => {
  const ip = peer.TailscaleIPs?.find(isTailscaleIp);
  if (!ip) return undefined;
  return {
    id: peer.ID ?? ip,
    name: peer.DNSName?.replace(/\.$/, '') ?? peer.HostName ?? ip,
    ip,
    online: peer.Online === true,
    route: routeFor(peer),
  };
};

export class TailscaleService {
  private executable?: string;
  private cached?: { status: TailscaleStatus; expiresAt: number };

  async getStatus(force = false): Promise<TailscaleStatus> {
    if (!force && this.cached && this.cached.expiresAt > Date.now()) return this.cached.status;
    this.executable ??= await findExecutable();
    if (!this.executable) return this.remember({ state: 'not-installed', peers: [], message: 'Instale o Tailscale para continuar.' });

    let parsed: RawStatus;
    try {
      const { stdout } = await execFileAsync(this.executable, ['status', '--json'], { windowsHide: true, timeout: 5_000, maxBuffer: 1024 * 1024 });
      parsed = JSON.parse(stdout) as RawStatus;
    } catch {
      return this.remember({ state: 'offline', peers: [], message: 'Não foi possível consultar o estado do Tailscale.' });
    }

    return this.remember(parseTailscaleStatus(parsed));
  }

  private remember(status: TailscaleStatus): TailscaleStatus {
    this.cached = { status, expiresAt: Date.now() + 3_000 };
    return status;
  }
}

export const parseTailscaleStatus = (parsed: RawStatus): TailscaleStatus => {
  if (parsed.BackendState !== 'Running') return { state: 'not-authenticated', peers: [], message: 'Entre na sua tailnet pelo aplicativo Tailscale.' };
  const selfIp = parsed.Self?.TailscaleIPs?.find(isTailscaleIp);
  if (!selfIp) return { state: 'offline', peers: [], message: 'O Tailscale não possui um IP ativo neste computador.' };
  const peers = Object.values(parsed.Peer ?? {}).map(peerFrom).filter((peer): peer is TailscalePeer => peer !== undefined);
  const onlinePeers = peers.filter((peer) => peer.online);
  if (onlinePeers.length === 0) return { state: 'no-peers', selfIp, peers, message: 'Nenhum outro computador da tailnet está online.' };
  return { state: 'ready', selfIp, peers: onlinePeers };
};
