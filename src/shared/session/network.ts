import type { CandidateData } from './types';

export const isTailscaleIp = (value: string): boolean => {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    return octets.every((octet) => octet <= 255) && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  }
  return value.toLowerCase().startsWith('fd7a:115c:a1e0:');
};

export const candidateAddress = (candidate: string): string | undefined => candidate.trim().split(/\s+/)[4];

export const filterTailscaleCandidates = (candidates: CandidateData[], selfIp: string): CandidateData[] => candidates.filter((candidate) => candidateAddress(candidate.candidate) === selfIp);
