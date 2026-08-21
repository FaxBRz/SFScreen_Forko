import type { CandidateData } from './types';
import { embeddedStunPort } from './types';

export const isTailscaleIp = (value: string): boolean => {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    return octets.every((octet) => octet <= 255) && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  }
  return value.toLowerCase().startsWith('fd7a:115c:a1e0:');
};

export const candidateAddress = (candidate: string): string | undefined => candidate.trim().split(/\s+/)[4];

const normalizedIp = (value: string): string | undefined => {
  const ip = value.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (!ip.includes(':')) return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? ip : undefined;

  const [head, tail, ...rest] = ip.split('::');
  if (rest.length > 0) return undefined;
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part)) || left.length + right.length > 8) return undefined;
  const parts = ip.includes('::')
    ? [...left, ...Array.from({ length: 8 - left.length - right.length }, () => '0'), ...right]
    : left;
  return parts.length === 8 ? parts.map((part) => part.padStart(4, '0')).join(':') : undefined;
};

export const filterTailscaleCandidates = (candidates: CandidateData[], selfIps: readonly string[]): CandidateData[] => {
  const allowed = new Set(selfIps.map(normalizedIp).filter((ip): ip is string => ip !== undefined));
  return candidates.filter((candidate) => {
    const address = candidateAddress(candidate.candidate);
    const normalized = address ? normalizedIp(address) : undefined;
    return normalized !== undefined && allowed.has(normalized);
  });
};

export const tailscaleHttpUrl = (ip: string, port: number, pathname: string): string => {
  const host = ip.includes(':') ? `[${ip}]` : ip;
  return `http://${host}:${port}${pathname}`;
};

export const tailscaleStunUrl = (ip: string): string => `stun:${ip.includes(':') ? `[${ip}]` : ip}:${embeddedStunPort}`;
