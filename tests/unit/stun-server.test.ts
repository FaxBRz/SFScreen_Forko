import { describe, expect, it } from 'vitest';
import { isStunBindingRequest, stunBindingSuccess } from '../../src/main/tailscale/stun-server';

const bindingRequest = (transaction = Buffer.from('00112233445566778899aabb', 'hex')): Buffer => {
  const request = Buffer.alloc(20);
  request.writeUInt16BE(0x0001, 0);
  request.writeUInt16BE(0, 2);
  request.writeUInt32BE(0x2112a442, 4);
  transaction.copy(request, 8);
  return request;
};

describe('embedded Tailscale STUN server', () => {
  it('recognizes only complete STUN binding requests', () => {
    expect(isStunBindingRequest(bindingRequest())).toBe(true);
    expect(isStunBindingRequest(Buffer.alloc(20))).toBe(false);
    expect(isStunBindingRequest(bindingRequest().subarray(0, 19))).toBe(false);
  });

  it('returns a binding success with the matching transaction and XOR mapped address', () => {
    const request = bindingRequest();
    const response = stunBindingSuccess(request, '100.90.1.2', 43921);
    expect(response).toBeDefined();
    expect(response?.readUInt16BE(0)).toBe(0x0101);
    expect(response?.readUInt16BE(2)).toBe(12);
    expect(response?.subarray(8, 20)).toEqual(request.subarray(8, 20));
    expect(response?.readUInt16BE(20)).toBe(0x0020);
  });

  it('does not construct a response for malformed requests or addresses', () => {
    expect(stunBindingSuccess(Buffer.alloc(20), '100.90.1.2', 43921)).toBeUndefined();
    expect(stunBindingSuccess(bindingRequest(), '192.168.1.2', 0)).toBeUndefined();
  });
});
