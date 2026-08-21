import { isValidSessionCode } from './code';
import { sessionProtocolVersion, type CandidateData, type SessionDescription } from './types';

const maxCandidates = 64;
const maxSdpLength = 256 * 1024;
const maxCandidateLength = 2_048;
const maxIdentifierLength = 128;

const isCandidateData = (value: unknown): value is CandidateData => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.candidate === 'string'
    && candidate.candidate.length > 0
    && candidate.candidate.length <= maxCandidateLength
    && (typeof candidate.sdpMid === 'string' || candidate.sdpMid === null)
    && (typeof candidate.sdpMLineIndex === 'number' || candidate.sdpMLineIndex === null)
    && (candidate.usernameFragment === undefined || typeof candidate.usernameFragment === 'string' || candidate.usernameFragment === null);
};

export const isSessionDescription = (value: unknown, expectedType?: 'offer' | 'answer'): value is SessionDescription => {
  if (typeof value !== 'object' || value === null) return false;
  const description = value as Record<string, unknown>;
  return description.protocolVersion === sessionProtocolVersion
    && (description.type === 'offer' || description.type === 'answer')
    && (expectedType === undefined || description.type === expectedType)
    && typeof description.sdp === 'string'
    && description.sdp.length > 0
    && description.sdp.length <= maxSdpLength
    && Array.isArray(description.candidates)
    && description.candidates.length <= maxCandidates
    && description.candidates.every(isCandidateData)
    && typeof description.fingerprint === 'string'
    && description.fingerprint.length > 0
    && description.fingerprint.length <= maxIdentifierLength
    && typeof description.sessionId === 'string'
    && description.sessionId.length >= 16
    && description.sessionId.length <= maxIdentifierLength
    && typeof description.nonce === 'string'
    && description.nonce.length >= 16
    && description.nonce.length <= maxIdentifierLength
    && typeof description.expiresAt === 'string'
    && Number.isFinite(Date.parse(description.expiresAt));
};

export const isSessionCode = (value: unknown): value is string => typeof value === 'string' && isValidSessionCode(value);
