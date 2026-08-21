import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../shared/session/code';
import { filterTailscaleCandidates } from '../shared/session/network';
import { sessionLifetimeMs, type CandidateData, type SessionDescription, type TailscaleStatus } from '../shared/session/types';

type SessionState = 'idle' | 'checking' | 'hosting' | 'searching' | 'negotiating' | 'verifying' | 'connected' | 'failed' | 'closed';

const emptyStatus: TailscaleStatus = { state: 'offline', peers: [] };

const extractFingerprint = (sdp: string): string => {
  const fingerprint = /^a=fingerprint:sha-256\s+(.+)$/im.exec(sdp)?.[1]?.trim();
  if (!fingerprint) throw new Error('A descrição WebRTC não contém fingerprint DTLS.');
  return fingerprint;
};

const securityCode = async (sessionId: string, nonce: string, first: string, second: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`${sessionId}|${nonce}|${[first, second].sort().join('|')}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return (Number.parseInt(hex.slice(0, 12), 16) % 1_000_000).toString().padStart(6, '0');
};

const waitForIce = (peer: RTCPeerConnection): Promise<void> => new Promise((resolve) => {
  if (peer.iceGatheringState === 'complete') return resolve();
  const finish = (): void => {
    window.clearTimeout(timeout);
    peer.removeEventListener('icegatheringstatechange', onChange);
    resolve();
  };
  const onChange = (): void => { if (peer.iceGatheringState === 'complete') finish(); };
  const timeout = window.setTimeout(finish, 5_000);
  peer.addEventListener('icegatheringstatechange', onChange);
});

const toCandidateData = (candidate: RTCIceCandidate): CandidateData => {
  const value = candidate.toJSON();
  return {
    candidate: value.candidate ?? '',
    sdpMid: value.sdpMid ?? null,
    sdpMLineIndex: value.sdpMLineIndex ?? null,
    usernameFragment: value.usernameFragment ?? null,
  };
};

export const App = (): ReactElement => {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const localConfirmedRef = useRef(false);
  const remoteConfirmedRef = useRef(false);
  const remoteIpRef = useRef<string | undefined>(undefined);
  const [tailscale, setTailscale] = useState<TailscaleStatus>(emptyStatus);
  const [state, setState] = useState<SessionState>('checking');
  const [message, setMessage] = useState('Verificando o Tailscale…');
  const [error, setError] = useState<string>();
  const [sessionCode, setSessionCode] = useState<string>();
  const [joinCode, setJoinCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<number>();
  const [security, setSecurity] = useState<string>();
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [remoteConfirmed, setRemoteConfirmed] = useState(false);
  const [route, setRoute] = useState('unknown');
  const [currentTime, setCurrentTime] = useState(0);

  const refreshTailscale = async (): Promise<TailscaleStatus> => {
    const next = await window.sfscreen.getTailscaleStatus();
    setTailscale(next);
    return next;
  };

  const closeSession = async (): Promise<void> => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    await window.sfscreen.stopHostedSession();
    localConfirmedRef.current = false; remoteConfirmedRef.current = false; remoteIpRef.current = undefined;
    setSessionCode(undefined); setSecurity(undefined); setLocalConfirmed(false); setRemoteConfirmed(false); setExpiresAt(undefined);
    setState('closed'); setMessage('Sessão encerrada.');
  };

  const attachChannel = (channel: RTCDataChannel): void => {
    channelRef.current = channel;
    channel.onopen = () => { setState('verifying'); setMessage('Canal WebRTC conectado. Compare o código de segurança.'); };
    channel.onmessage = (event) => {
      if (event.data === 'security-confirmed') setRemoteConfirmed(true);
      if (event.data === 'security-confirmed') {
        remoteConfirmedRef.current = true;
        if (localConfirmedRef.current) { setState('connected'); setMessage('Conexão verificada e pronta para a próxima etapa de mídia.'); }
      }
    };
  };

  const createPeer = (): { peer: RTCPeerConnection; candidates: CandidateData[] } => {
    const candidates: CandidateData[] = [];
    const peer = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) candidates.push(toCandidateData(event.candidate)); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') { setState('failed'); setError('A conexão WebRTC falhou pela interface Tailscale.'); }
      if (peer.connectionState === 'connected') void refreshTailscale().then((status) => {
        const peerRoute = status.peers.find((item) => item.ip === remoteIpRef.current)?.route;
        if (peerRoute) setRoute(peerRoute);
      });
    };
    peer.ondatachannel = (event) => attachChannel(event.channel);
    peerRef.current = peer;
    return { peer, candidates };
  };

  const createDescription = (type: 'offer' | 'answer', sdp: string, candidates: CandidateData[], selfIp: string, sessionId: string, nonce: string): SessionDescription => {
    const filtered = filterTailscaleCandidates(candidates, selfIp);
    if (filtered.length === 0) throw new Error('O Chromium não expôs um candidato ICE do adaptador Tailscale.');
    return { type, sdp, candidates: filtered, fingerprint: extractFingerprint(sdp), sessionId, nonce, expiresAt: new Date(Date.now() + sessionLifetimeMs).toISOString() };
  };

  const addRemoteDescription = async (peer: RTCPeerConnection, description: SessionDescription): Promise<void> => {
    await peer.setRemoteDescription({ type: description.type, sdp: description.sdp });
    for (const candidate of description.candidates) await peer.addIceCandidate(candidate);
  };

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshTailscale().then((status) => {
      setState(status.state === 'ready' ? 'idle' : 'failed');
      setMessage(status.state === 'ready' ? 'Tailscale pronto. Crie ou entre em uma sessão.' : status.message ?? 'Tailscale indisponível.');
    }), 0);
    const clock = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    const unsubscribe = window.sfscreen.onSessionAnswer((event) => {
      const peer = peerRef.current;
      if (!peer) return;
      void (async () => {
        try {
          await addRemoteDescription(peer, event.answer);
          remoteIpRef.current = event.peerIp;
          const local = peer.localDescription;
          if (local) setSecurity(await securityCode(event.answer.sessionId, event.answer.nonce, extractFingerprint(local.sdp), event.answer.fingerprint));
          setState('verifying'); setMessage('Resposta recebida. Aguarde o canal WebRTC e compare o código.');
        } catch {
          setState('failed'); setError('Não foi possível aplicar a resposta WebRTC.');
        }
      })();
    });
    return () => { window.clearTimeout(initialTimer); window.clearInterval(clock); unsubscribe(); peerRef.current?.close(); void window.sfscreen.stopHostedSession(); };
  }, []);

  const host = async (): Promise<void> => {
    setError(undefined); setState('hosting'); setMessage('Criando sessão e candidatos Tailscale…');
    try {
      const status = await refreshTailscale();
      const selfIp = status.selfIp;
      if (status.state !== 'ready') throw new Error(status.message ?? 'Tailscale indisponível.');
      if (!selfIp) throw new Error('O Tailscale não forneceu um IP local.');
      const tailscaleIp: string = selfIp;
      const { peer, candidates } = createPeer();
      attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
      const offer = await peer.createOffer();
      if (!offer.sdp) throw new Error('A oferta WebRTC não contém SDP.');
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const description = createDescription('offer', offer.sdp, candidates, tailscaleIp, crypto.randomUUID(), crypto.randomUUID());
      const hosted = await window.sfscreen.hostSession(description);
      setSessionCode(hosted.code); setExpiresAt(Date.parse(hosted.expiresAt)); setMessage('Sessão pronta. Diga este código ao espectador.');
    } catch (caught) {
      peerRef.current?.close(); peerRef.current = null;
      setState('failed'); setError(caught instanceof Error ? caught.message : 'Não foi possível criar a sessão.');
    }
  };

  const join = async (): Promise<void> => {
    setError(undefined); setState('searching'); setMessage('Procurando sessão na tailnet…');
    try {
      const code = formatSessionCode(joinCode);
      const status = await refreshTailscale();
      const selfIp = status.selfIp;
      if (status.state !== 'ready') throw new Error(status.message ?? 'Tailscale indisponível.');
      if (!selfIp) throw new Error('O Tailscale não forneceu um IP local.');
      const tailscaleIp: string = selfIp;
      const found = await window.sfscreen.findSession(code);
      remoteIpRef.current = found.hostIp;
      setState('negotiating'); setMessage('Sessão encontrada. Criando resposta WebRTC…');
      const { peer, candidates } = createPeer();
      await addRemoteDescription(peer, found.offer);
      const answer = await peer.createAnswer();
      if (!answer.sdp) throw new Error('A resposta WebRTC não contém SDP.');
      await peer.setLocalDescription(answer);
      await waitForIce(peer);
      const description = createDescription('answer', answer.sdp, candidates, tailscaleIp, found.offer.sessionId, found.offer.nonce);
      setSecurity(await securityCode(description.sessionId, description.nonce, found.offer.fingerprint, description.fingerprint));
      await window.sfscreen.submitAnswer(found.hostIp, code, description);
      setState('verifying'); setMessage('Resposta enviada. Aguarde o canal WebRTC e compare o código.');
    } catch (caught) {
      peerRef.current?.close(); peerRef.current = null;
      setState('failed'); setError(caught instanceof Error ? caught.message : 'Não foi possível entrar na sessão.');
    }
  };

  const confirmSecurity = (): void => {
    localConfirmedRef.current = true;
    setLocalConfirmed(true);
    if (channelRef.current?.readyState === 'open') channelRef.current.send('security-confirmed');
    if (remoteConfirmedRef.current) { setState('connected'); setMessage('Conexão verificada e pronta para a próxima etapa de mídia.'); }
  };

  const secondsRemaining = expiresAt && currentTime > 0 ? Math.max(0, Math.ceil((expiresAt - currentTime) / 1000)) : undefined;

  return <main>
    <section className="intro"><p className="eyebrow">SFScreen V0 · Tailscale</p><h1>Conexão por código curto</h1><p>Sem arquivos, servidor próprio, STUN ou TURN. A sinalização ocorre apenas entre computadores da sua tailnet.</p></section>
    <section className="diagnostic card"><h2>Tailscale</h2><p className={tailscale.state === 'ready' ? 'connected' : 'error'}>{tailscale.state === 'ready' ? `${tailscale.peers.length} peer(s) online · IP ${tailscale.selfIp}` : tailscale.message ?? 'Indisponível'}</p><button className="secondary" type="button" onClick={() => void refreshTailscale()}>Atualizar diagnóstico</button></section>
    <section className="workspace">
      <section className="card"><h2>Compartilhar</h2><p>Crie um código de uso único para o espectador.</p><button className="primary" type="button" onClick={() => void host()} disabled={tailscale.state !== 'ready' || state === 'hosting'}>Criar sessão</button>{sessionCode && <><p className="session-code">{sessionCode}</p><p>{secondsRemaining !== undefined ? `Expira em ${secondsRemaining}s.` : ''}</p></>}</section>
      <section className="card"><h2>Assistir</h2><p>Digite o código mostrado pelo apresentador.</p><input className="code-input" value={formatSessionCode(joinCode)} onChange={(event) => setJoinCode(normalizeSessionCode(event.target.value))} placeholder="XXX-XXX-X" maxLength={9} aria-label="Código da sessão" /><button className="primary" type="button" onClick={() => void join()} disabled={tailscale.state !== 'ready' || state === 'searching'}>Conectar</button></section>
      <section className="card session-status"><h2>Estado da sessão</h2><p>{message}</p>{error && <p className="error" role="alert">{error}</p>}{security && <><p className="security-code">{security}</p><p>Compare estes seis dígitos pelo canal externo antes de confirmar.</p><button className="primary" type="button" onClick={confirmSecurity} disabled={localConfirmed}>O código confere</button><p>{localConfirmed ? 'Você confirmou.' : 'Aguardando sua confirmação.'} {remoteConfirmed ? 'O outro participante confirmou.' : 'Aguardando o outro participante.'}</p></>}<p className={state === 'connected' ? 'connected' : 'disconnected'}>{state === 'connected' ? `Conexão verificada · rota Tailscale: ${route}` : `Estado: ${state}`}</p><button className="secondary" type="button" onClick={() => void closeSession()} disabled={state === 'idle' || state === 'closed'}>Encerrar sessão</button></section>
    </section>
  </main>;
};
