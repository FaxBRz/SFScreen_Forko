import { describe, expect, it } from 'vitest';
import { candidateAddress, filterTailscaleCandidates, isTailscaleIp } from '../../src/shared/session/network';

describe('Tailscale network validation', () => {
  it('accepts Tailscale IPv4 and IPv6 ranges only', () => {
    expect(isTailscaleIp('100.64.0.1')).toBe(true);
    expect(isTailscaleIp('100.127.255.255')).toBe(true);
    expect(isTailscaleIp('100.128.0.1')).toBe(false);
    expect(isTailscaleIp('fd7a:115c:a1e0::1')).toBe(true);
    expect(isTailscaleIp('192.168.1.10')).toBe(false);
  });

  it('keeps only candidates for the active Tailscale interface', () => {
    const candidates = [
      { candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      { candidate: 'candidate:2 1 udp 1 192.168.1.2 43921 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    ];
    expect(candidateAddress(candidates[0]!.candidate)).toBe('100.90.1.2');
    expect(filterTailscaleCandidates(candidates, '100.90.1.2')).toEqual([candidates[0]]);
  });
});
