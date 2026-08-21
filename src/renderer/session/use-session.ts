import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../../shared/session/code';
import type { SessionError, TailscaleStatus } from '../../shared/session/types';
import { initialSessionState, sessionReducer, type SessionUiState } from './session-machine';
import { WebRtcSession } from './webrtc-session';

const errorMessage = (error: SessionError | Error | unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir a operação.';
};

export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  setJoinCode: (value: string) => void;
  refresh: () => Promise<TailscaleStatus | undefined>;
  host: () => Promise<void>;
  join: () => Promise<void>;
  confirmSecurity: () => void;
  close: () => Promise<void>;
  copyCode: () => Promise<boolean>;
}

export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const controllerRef = useRef<WebRtcSession | undefined>(undefined);
  const remoteIpRef = useRef<string | undefined>(undefined);
  const localConfirmedRef = useRef(false);
  const remoteConfirmedRef = useRef(false);

  const refresh = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    try {
      const status = await window.sfscreen.getTailscaleStatus();
      dispatch({ type: 'status', status });
      return status;
    } catch {
      dispatch({ type: 'failed', message: 'Não foi possível consultar o Tailscale.' });
      return undefined;
    }
  }, []);

  const close = useCallback(async (): Promise<void> => {
    controllerRef.current?.close();
    controllerRef.current = undefined;
    remoteIpRef.current = undefined;
    localConfirmedRef.current = false;
    remoteConfirmedRef.current = false;
    await window.sfscreen.stopHostedSession();
    dispatch({ type: 'closed' });
  }, []);

  const createController = useCallback((): WebRtcSession => {
    controllerRef.current?.close();
    const controller = new WebRtcSession({
      onChannelOpen: () => dispatch({ type: 'verifying', message: 'Canal seguro conectado. Compare o código de segurança.' }),
      onRemoteConfirmed: () => {
        remoteConfirmedRef.current = true;
        dispatch({ type: 'remote-confirmed' });
        if (localConfirmedRef.current) dispatch({ type: 'connected' });
      },
      onConnectionState: (connectionState) => {
        if (connectionState === 'failed') dispatch({ type: 'failed', message: 'A conexão WebRTC falhou pela interface Tailscale.' });
        if (connectionState === 'connected') {
          void window.sfscreen.getTailscaleStatus().then((status) => {
            const route = status.peers.find((peer) => peer.ip === remoteIpRef.current)?.route;
            if (route) dispatch({ type: 'route', route });
          });
        }
      },
    });
    controllerRef.current = controller;
    return controller;
  }, []);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1_000);
    const unsubscribe = window.sfscreen.onSessionAnswer((event) => {
      const controller = controllerRef.current;
      if (!controller) return;
      void controller.applyAnswer(event.answer)
        .then((securityCode) => {
          remoteIpRef.current = event.peerIp;
          dispatch({ type: 'verifying', securityCode, message: 'Resposta recebida. Aguarde o canal seguro e compare o código.' });
        })
        .catch((caught: unknown) => dispatch({ type: 'failed', message: errorMessage(caught) }));
    });
    return () => {
      window.clearInterval(clock);
      unsubscribe();
      controllerRef.current?.close();
      void window.sfscreen.stopHostedSession();
    };
  }, [refresh]);

  const requireReady = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    const status = await refresh();
    if (!status || status.state !== 'ready' || !status.selfIp) {
      dispatch({ type: 'failed', message: status?.message ?? 'Tailscale indisponível.' });
      return undefined;
    }
    return status;
  }, [refresh]);

  const host = useCallback(async (): Promise<void> => {
    dispatch({ type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando a conexão segura…' });
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      const controller = createController();
      const offer = await controller.createOffer(status.selfIp, crypto.randomUUID(), crypto.randomUUID());
      const result = await window.sfscreen.hostSession(offer);
      if (!result.ok) return dispatch({ type: 'failed', message: result.error.message });
      dispatch({ type: 'hosted', hosted: result.value });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [createController, requireReady]);

  const join = useCallback(async (): Promise<void> => {
    const code = formatSessionCode(joinCode);
    dispatch({ type: 'begin', role: 'viewer', phase: 'searching', message: 'Procurando a sessão na sua tailnet…' });
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      const found = await window.sfscreen.findSession(code);
      if (!found.ok) return dispatch({ type: 'failed', message: found.error.message });
      remoteIpRef.current = found.value.hostIp;
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sessão encontrada. Criando conexão segura…' });
      const controller = createController();
      const { answer, securityCode } = await controller.createAnswer(found.value.offer, status.selfIp);
      dispatch({ type: 'verifying', securityCode, message: 'Resposta enviada. Aguarde o canal seguro e compare o código.' });
      const submitted = await window.sfscreen.submitAnswer(found.value.hostIp, code, answer);
      if (!submitted.ok) dispatch({ type: 'failed', message: submitted.error.message });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [joinCode, createController, requireReady]);

  const confirmSecurity = useCallback((): void => {
    localConfirmedRef.current = true;
    controllerRef.current?.confirmSecurity();
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) dispatch({ type: 'connected' });
  }, []);

  const setJoinCode = useCallback((value: string): void => setJoinCodeState(normalizeSessionCode(value)), []);
  const copyCode = useCallback(async (): Promise<boolean> => {
    if (!state.hosted) return false;
    try {
      await navigator.clipboard.writeText(state.hosted.code);
      return true;
    } catch {
      return false;
    }
  }, [state.hosted]);

  return { state, joinCode, setJoinCode, refresh, host, join, confirmSecurity, close, copyCode };
};
