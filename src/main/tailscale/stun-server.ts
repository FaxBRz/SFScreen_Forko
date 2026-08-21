import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import { isTailscaleIp } from '../../shared/session/network';
import { embeddedStunPort, type TailscaleStatus } from '../../shared/session/types';

const bindingRequest = 0x0001;
const bindingSuccess = 0x0101;
const xorMappedAddress = 0x0020;
const magicCookie = 0x2112a442;

const ipv4Bytes = (address: string): number[] | undefined => {
  const octets = address.split('.').map(Number);
  return octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : undefined;
};

export const isStunBindingRequest = (message: Buffer): boolean => message.length >= 20
  && message.readUInt16BE(0) === bindingRequest
  && message.readUInt16BE(2) === message.length - 20
  && message.readUInt32BE(4) === magicCookie;

export const stunBindingSuccess = (request: Buffer, address: string, port: number): Buffer | undefined => {
  const ip = ipv4Bytes(address);
  if (!isStunBindingRequest(request) || !ip || port < 1 || port > 65_535) return undefined;
  const response = Buffer.alloc(32);
  response.writeUInt16BE(bindingSuccess, 0);
  response.writeUInt16BE(12, 2);
  response.writeUInt32BE(magicCookie, 4);
  request.copy(response, 8, 8, 20);
  response.writeUInt16BE(xorMappedAddress, 20);
  response.writeUInt16BE(8, 22);
  response.writeUInt8(0, 24);
  response.writeUInt8(0x01, 25);
  response.writeUInt16BE(port ^ (magicCookie >>> 16), 26);
  const cookie = Buffer.alloc(4);
  cookie.writeUInt32BE(magicCookie, 0);
  ip.forEach((octet, index) => response.writeUInt8(octet ^ cookie[index]!, 28 + index));
  return response;
};

export class TailscaleStunServer {
  private socket?: Socket;
  private boundAddress?: string;

  constructor(private readonly getTailscaleStatus: () => Promise<TailscaleStatus>, private readonly port = embeddedStunPort) {}

  async ensure(status: TailscaleStatus): Promise<void> {
    if (status.state !== 'ready' || !status.selfIp || status.selfIp.includes(':')) {
      await this.stop();
      return;
    }
    if (this.socket && this.boundAddress === status.selfIp) return;
    await this.stop();

    const socket = createSocket('udp4');
    socket.on('message', (message, remote) => { void this.handle(socket, message, remote); });
    socket.on('error', () => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.boundAddress = undefined;
      }
    });
    this.socket = socket;
    this.boundAddress = status.selfIp;
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        socket.once('error', onError);
        socket.bind(this.port, status.selfIp, () => {
          socket.off('error', onError);
          resolve();
        });
      });
    } catch (error) {
      if (this.socket === socket) {
        this.socket = undefined;
        this.boundAddress = undefined;
      }
      socket.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    this.boundAddress = undefined;
    if (!socket) return;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  private async handle(socket: Socket, message: Buffer, remote: RemoteInfo): Promise<void> {
    if (!isStunBindingRequest(message) || remote.family !== 'IPv4' || !isTailscaleIp(remote.address)) return;
    const status = await this.getTailscaleStatus();
    const isSelf = status.selfIps?.includes(remote.address) || status.selfIp === remote.address;
    const isPeer = status.state === 'ready' && status.peers.some((peer) => peer.online && peer.ip === remote.address);
    if (!isSelf && !isPeer) return;
    const response = stunBindingSuccess(message, remote.address, remote.port);
    if (response) socket.send(response, remote.port, remote.address);
  }
}
