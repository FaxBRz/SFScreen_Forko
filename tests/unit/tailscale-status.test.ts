import { describe, expect, it } from 'vitest';
import { parseTailscaleStatus } from '../../src/main/tailscale/tailscale-service';

describe('Tailscale status parser', () => {
  it('reports ready peers and their route', () => {
    const status = parseTailscaleStatus({
      BackendState: 'Running',
      Self: { TailscaleIPs: ['100.90.1.2'] },
      Peer: { peer: { ID: 'peer', DNSName: 'viewer.tailnet.ts.net.', TailscaleIPs: ['100.90.1.3'], Online: true, CurAddr: '203.0.113.2:41641' } },
    });
    expect(status).toMatchObject({ state: 'ready', selfIp: '100.90.1.2', peers: [{ id: 'peer', route: 'direct' }] });
  });

  it('reports unauthenticated and no-peer states', () => {
    expect(parseTailscaleStatus({ BackendState: 'NeedsLogin' }).state).toBe('not-authenticated');
    expect(parseTailscaleStatus({ BackendState: 'Running', Self: { TailscaleIPs: ['100.90.1.2'] } }).state).toBe('no-peers');
  });

  it('recognizes a peer relay route', () => {
    const status = parseTailscaleStatus({ BackendState: 'Running', Self: { TailscaleIPs: ['100.90.1.2'] }, Peer: { peer: { TailscaleIPs: ['100.90.1.3'], Online: true, PeerRelay: 'relay-device' } } });
    expect(status.peers[0]?.route).toBe('peer-relay');
  });
});
