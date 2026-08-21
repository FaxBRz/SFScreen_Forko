import { describe, expect, it } from 'vitest';
import { candidateAddress, filterTailscaleCandidates, isTailscaleIp, tailscaleHttpUrl, tailscaleStunUrl } from '../../src/shared/session/network';

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
    expect(filterTailscaleCandidates(candidates, ['100.90.1.2'])).toEqual([candidates[0]]);
  });

  it('keeps a known local Tailscale IPv6 candidate regardless of compression', () => {
    const candidate = { candidate: 'candidate:3 1 udp 1 fd7a:115c:a1e0:0:0:0:0:1 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    expect(filterTailscaleCandidates([candidate], ['fd7a:115c:a1e0::1'])).toEqual([candidate]);
  });

  it('formats IPv4 and IPv6 Tailscale URLs safely', () => {
    expect(tailscaleHttpUrl('100.90.1.2', 43917, '/v1/session/lookup')).toBe('http://100.90.1.2:43917/v1/session/lookup');
    expect(tailscaleHttpUrl('fd7a:115c:a1e0::1', 43917, '/v1/session/lookup')).toBe('http://[fd7a:115c:a1e0::1]:43917/v1/session/lookup');
    expect(tailscaleStunUrl('100.90.1.2')).toBe('stun:100.90.1.2:43920');
  });
});
