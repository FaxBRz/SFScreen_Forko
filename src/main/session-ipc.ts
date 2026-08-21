import type { IpcMain } from 'electron';
import { failure, toSessionResult } from '../shared/session/errors';
import { isSessionCode, isSessionDescription } from '../shared/session/protocol';
import type { SessionDescription, TailscaleStatus } from '../shared/session/types';
import { ipcChannels } from '../shared/ipc';
import { ScreenCaptureService } from './capture/screen-capture-service';
import { SessionServer } from './tailscale/session-server';
import { TailscaleService } from './tailscale/tailscale-service';

interface SessionIpcDependencies {
  ipcMain: IpcMain;
  tailscale: TailscaleService;
  sessionServer: SessionServer;
  screenCapture: ScreenCaptureService;
}

const invalid = <T>(message: string) => failure<T>('invalid-request', message);

export const registerSessionIpc = ({ ipcMain, tailscale, sessionServer, screenCapture }: SessionIpcDependencies): void => {
  ipcMain.handle(ipcChannels.listScreenSources, () => toSessionResult(() => screenCapture.listSources()));
  ipcMain.handle(ipcChannels.selectScreenSource, (event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || sourceId.length === 0 || sourceId.length > 256) return invalid('O monitor selecionado é inválido.');
    return toSessionResult(async () => {
      await screenCapture.selectSource(event.sender.id, sourceId);
      return undefined;
    });
  });
  ipcMain.handle(ipcChannels.clearScreenSource, (event) => toSessionResult(async () => {
    screenCapture.clearSource(event.sender.id);
    return undefined;
  }));
  ipcMain.handle(ipcChannels.getTailscaleStatus, (): Promise<TailscaleStatus> => tailscale.getStatus(true));
  ipcMain.handle(ipcChannels.hostSession, (event, offer: unknown) => {
    if (!isSessionDescription(offer, 'offer')) return invalid('A oferta WebRTC é inválida ou incompatível.');
    return toSessionResult(async () => sessionServer.host(offer as SessionDescription, await tailscale.getStatus(true), (answer) => event.sender.send(ipcChannels.sessionAnswer, answer)));
  });
  ipcMain.handle(ipcChannels.findSession, (_event, code: unknown) => {
    if (!isSessionCode(code)) return invalid('Digite um código válido no formato XXX-XXX-X.');
    return toSessionResult(async () => sessionServer.find(code, await tailscale.getStatus(true)));
  });
  ipcMain.handle(ipcChannels.submitAnswer, (_event, hostIp: unknown, code: unknown, answer: unknown) => {
    if (typeof hostIp !== 'string' || !isSessionCode(code) || !isSessionDescription(answer, 'answer')) return invalid('A resposta de sessão é inválida.');
    return toSessionResult(() => sessionServer.submitAnswer(hostIp, code, answer));
  });
  ipcMain.handle(ipcChannels.stopHostedSession, () => toSessionResult(async () => {
    await sessionServer.stop();
    return undefined;
  }));
};
