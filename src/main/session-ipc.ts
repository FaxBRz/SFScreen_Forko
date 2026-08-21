import type { IpcMain, WebContents } from 'electron';
import { failure, toSessionResult } from '../shared/session/errors';
import { isSessionCode, isSessionDescription } from '../shared/session/protocol';
import type { SessionDescription, TailscaleStatus } from '../shared/session/types';
import { ipcChannels } from '../shared/ipc';
import { ScreenCaptureService } from './capture/screen-capture-service';
import { DiagnosticsService } from './diagnostics-service';
import { SessionServer } from './tailscale/session-server';
import { TailscaleService } from './tailscale/tailscale-service';

interface SessionIpcDependencies {
  ipcMain: IpcMain;
  tailscale: TailscaleService;
  sessionServer: SessionServer;
  screenCapture: ScreenCaptureService;
  diagnostics: DiagnosticsService;
  isAuthorizedSender: (sender: WebContents) => boolean;
}

const invalid = <T>(message: string) => failure<T>('invalid-request', message);

export const registerSessionIpc = ({ ipcMain, tailscale, sessionServer, screenCapture, diagnostics, isAuthorizedSender }: SessionIpcDependencies): void => {
  const authorized = (sender: WebContents): boolean => !sender.isDestroyed() && isAuthorizedSender(sender);
  const unauthorized = <T>() => failure<T>('invalid-request', 'A origem desta solicitação não é autorizada.');
  ipcMain.handle(ipcChannels.listScreenSources, (event) => authorized(event.sender) ? toSessionResult(() => screenCapture.listSources()) : unauthorized());
  ipcMain.handle(ipcChannels.selectScreenSource, (event, selection: unknown) => {
    if (!authorized(event.sender)) return unauthorized();
    if (typeof selection !== 'object' || selection === null || !('sourceId' in selection) || !('includeSystemAudio' in selection)) return invalid('O monitor selecionado é inválido.');
    const value = selection as { sourceId?: unknown; includeSystemAudio?: unknown };
    if (typeof value.sourceId !== 'string' || value.sourceId.length === 0 || value.sourceId.length > 256 || typeof value.includeSystemAudio !== 'boolean') return invalid('O monitor selecionado é inválido.');
    return toSessionResult(async () => {
      await screenCapture.selectSource(event.sender.id, { sourceId: value.sourceId as string, includeSystemAudio: value.includeSystemAudio as boolean });
      return undefined;
    });
  });
  ipcMain.handle(ipcChannels.clearScreenSource, (event) => !authorized(event.sender) ? unauthorized() : toSessionResult(async () => {
    screenCapture.clearSource(event.sender.id);
    return undefined;
  }));
  ipcMain.handle(ipcChannels.exportDiagnostics, (event, report: unknown) => !authorized(event.sender) ? unauthorized() : toSessionResult(() => diagnostics.export(event.sender.id, report as import('../shared/diagnostics').DiagnosticsReport)));
  ipcMain.handle(ipcChannels.getTailscaleStatus, (event): Promise<TailscaleStatus> => authorized(event.sender) ? tailscale.getStatus(true) : Promise.resolve({ state: 'offline', peers: [], message: 'A origem desta solicitação não é autorizada.' }));
  ipcMain.handle(ipcChannels.hostSession, (event, offer: unknown) => {
    if (!authorized(event.sender)) return unauthorized();
    if (!isSessionDescription(offer, 'offer')) return invalid('A oferta WebRTC é inválida ou incompatível.');
    return toSessionResult(async () => sessionServer.host(offer as SessionDescription, await tailscale.getStatus(true), (answer) => {
      if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.sessionAnswer, answer);
    }));
  });
  ipcMain.handle(ipcChannels.findSession, (_event, code: unknown) => {
    if (!authorized(_event.sender)) return unauthorized();
    if (!isSessionCode(code)) return invalid('Digite um código válido no formato XXX-XXX-X.');
    return toSessionResult(async () => sessionServer.find(code, await tailscale.getStatus(true)));
  });
  ipcMain.handle(ipcChannels.submitAnswer, (_event, hostIp: unknown, code: unknown, answer: unknown) => {
    if (!authorized(_event.sender)) return unauthorized();
    if (typeof hostIp !== 'string' || !isSessionCode(code) || !isSessionDescription(answer, 'answer')) return invalid('A resposta de sessão é inválida.');
    return toSessionResult(() => sessionServer.submitAnswer(hostIp, code, answer));
  });
  ipcMain.handle(ipcChannels.stopHostedSession, (event) => !authorized(event.sender) ? unauthorized() : toSessionResult(async () => {
    await sessionServer.stop();
    return undefined;
  }));
};
