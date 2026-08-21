import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createSecurityCode, extractFingerprint, parseMessage, serializeMessage, signMessage, signalingVersion, signalLifetimeMs, type SignalKind, type SignalingMessage, type SignalingPayload } from '../shared/signaling';

type Role = 'presenter' | 'viewer' | undefined;

const directPeerConfiguration = (useStun: boolean): RTCConfiguration => ({
  iceServers: useStun ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
});

const waitForIceGathering = (peer: RTCPeerConnection): Promise<void> => new Promise((resolve, reject) => {
  if (peer.iceGatheringState === 'complete') return resolve();
  const onStateChange = (): void => {
    if (peer.iceGatheringState !== 'complete') return;
    window.clearTimeout(timeout);
    peer.removeEventListener('icegatheringstatechange', onStateChange);
    resolve();
  };
  const timeout = window.setTimeout(() => {
    peer.removeEventListener('icegatheringstatechange', onStateChange);
    reject(new Error('A coleta de candidatos ICE excedeu o tempo limite.'));
  }, 15_000);
  peer.addEventListener('icegatheringstatechange', onStateChange);
});

const makePayload = (kind: SignalKind, sessionId: string, nonce: string, description: RTCSessionDescription, candidates: RTCIceCandidateInit[]): SignalingPayload => {
  const createdAt = new Date();
  return {
    version: signalingVersion, kind, sessionId, nonce, createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + signalLifetimeMs).toISOString(),
    sdp: description.sdp,
    candidates: candidates.map((candidate) => JSON.stringify(candidate)),
    fingerprint: extractFingerprint(description.sdp),
  };
};

export const App = (): ReactElement => {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const localMessageRef = useRef<SignalingMessage | null>(null);
  const [role, setRole] = useState<Role>();
  const [status, setStatus] = useState('Pronto para criar ou importar uma sinalização manual.');
  const [securityCode, setSecurityCode] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const [useStun, setUseStun] = useState(true);
  const [candidateType, setCandidateType] = useState<string>();

  const closeSession = (): void => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localMessageRef.current = null;
    setRole(undefined); setSecurityCode(undefined); setConnected(false); setCandidateType(undefined); setError(undefined); setStatus('Sessão encerrada.');
  };

  const inspectSelectedRoute = async (peer: RTCPeerConnection): Promise<void> => {
    const reports = await peer.getStats();
    let localCandidateId: string | undefined;
    reports.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.selected || report.nominated)) {
        localCandidateId = report.localCandidateId as string | undefined;
      }
    });
    if (!localCandidateId) return;
    const localCandidate = reports.get(localCandidateId);
    if (localCandidate?.type === 'local-candidate' && typeof localCandidate.candidateType === 'string') {
      setCandidateType(localCandidate.candidateType);
    }
  };

  const preparePeer = (): { peer: RTCPeerConnection; candidates: RTCIceCandidateInit[] } => {
    const candidates: RTCIceCandidateInit[] = [];
    const peer = new RTCPeerConnection(directPeerConfiguration(useStun));
    peer.onicecandidate = (event) => { if (event.candidate) candidates.push(event.candidate.toJSON()); };
    peer.onconnectionstatechange = () => {
      setConnected(peer.connectionState === 'connected');
      if (peer.connectionState === 'connected') {
        void inspectSelectedRoute(peer);
        setStatus('Canal direto estabelecido. Compare o código antes da mídia.');
      }
      if (peer.connectionState === 'failed') setError('A conexão direta falhou. Esta rede pode bloquear UDP ou não oferecer uma rota P2P.');
    };
    peer.ondatachannel = (event) => {
      channelRef.current = event.channel;
      event.channel.onopen = () => setStatus('Canal de diagnóstico P2P aberto.');
    };
    peerRef.current = peer;
    return { peer, candidates };
  };

  useEffect(() => () => { channelRef.current?.close(); peerRef.current?.close(); }, []);

  const createInvite = async (): Promise<void> => {
    closeSession(); setError(undefined); setRole('presenter'); setStatus('Criando oferta WebRTC e coletando candidatos locais…');
    try {
      const { peer, candidates } = preparePeer();
      const channel = peer.createDataChannel('sfscreen-diagnostics', { ordered: true });
      channelRef.current = channel;
      channel.onopen = () => setStatus('Canal de diagnóstico P2P aberto.');
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);
      if (!peer.localDescription) throw new Error('A oferta WebRTC não foi criada.');
      const message = await signMessage(makePayload('invite', crypto.randomUUID(), crypto.randomUUID(), peer.localDescription, candidates));
      localMessageRef.current = message;
      const saved = await window.sfscreen.exportSignalFile('invite', serializeMessage(message));
      setStatus(saved ? 'Convite salvo. Envie-o ao espectador pelo canal externo combinado.' : 'Convite criado; o salvamento foi cancelado.');
    } catch {
      closeSession(); setError('Não foi possível criar um convite direto.');
    }
  };

  const importSignal = async (): Promise<void> => {
    setError(undefined);
    try {
      const contents = await window.sfscreen.importSignalFile();
      if (contents === null) return;
      const message = await parseMessage(contents);
      if (message.kind === 'invite') {
        if (peerRef.current) throw new Error('Encerre a sessão atual antes de importar um convite.');
        setRole('viewer'); setStatus('Convite validado. Criando resposta direta…');
        const { peer, candidates } = preparePeer();
        await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        await peer.setLocalDescription(await peer.createAnswer());
        await waitForIceGathering(peer);
        if (!peer.localDescription) throw new Error('A resposta WebRTC não foi criada.');
        const response = await signMessage(makePayload('answer', message.sessionId, message.nonce, peer.localDescription, candidates));
        localMessageRef.current = response;
        setSecurityCode(await createSecurityCode(message.sessionId, message.nonce, message.fingerprint, response.fingerprint));
        const saved = await window.sfscreen.exportSignalFile('answer', serializeMessage(response));
        setStatus(saved ? 'Resposta salva. Devolva-a ao apresentador e compare o código.' : 'Resposta criada; o salvamento foi cancelado.');
        return;
      }
      const local = localMessageRef.current;
      if (!local || local.kind !== 'invite' || message.sessionId !== local.sessionId || message.nonce !== local.nonce || !peerRef.current) throw new Error('Esta resposta não pertence à sessão atual.');
      setStatus('Resposta validada. Estabelecendo canal direto…');
      await peerRef.current.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      setSecurityCode(await createSecurityCode(local.sessionId, local.nonce, local.fingerprint, message.fingerprint));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível importar o arquivo de sinalização.');
    }
  };

  return <main>
    <section className="intro"><p className="eyebrow">SFScreen V0 · P2P direto</p><h1>Teste de conexão sem servidor</h1><p>Troque um convite e uma resposta por arquivo. O STUN apenas descobre rotas para uma conexão direta: ele não transporta tela, áudio ou dados.</p></section>
    <section className="workspace" aria-label="Sessão direta SFScreen">
      <section className="card"><h2>1. Apresentador</h2><p>Crie e envie o arquivo <code>.sfsinvite</code> para o espectador.</p><label className="toggle"><input type="checkbox" checked={useStun} onChange={(event) => setUseStun(event.target.checked)} disabled={role !== undefined} /> Internet direta com STUN experimental</label><p className="hint">Desative apenas para testar LAN com candidatos locais. TURN continua desativado.</p><button className="primary" type="button" onClick={() => void createInvite()} disabled={role !== undefined}>Criar convite</button></section>
      <section className="card"><h2>2. Espectador / apresentador</h2><p>Importe um convite para gerar a resposta ou importe a resposta recebida para concluir a negociação.</p><button className="primary" type="button" onClick={() => void importSignal()}>Importar convite ou resposta</button></section>
      <section className="card session-status"><h2>Estado da sessão</h2><p>{status}</p>{error && <p className="error" role="alert">{error}</p>}{securityCode && <><p className="security-code" aria-label="Código de segurança">{securityCode}</p><p>Compare estes seis dígitos por um canal externo antes de transmitir mídia.</p></>}<p className={connected ? 'connected' : 'disconnected'}>{connected ? `Conexão P2P direta ativa${candidateType ? ` · candidato ${candidateType}` : ''}` : 'Aguardando conexão direta'}</p><button className="secondary" type="button" onClick={closeSession} disabled={role === undefined}>Encerrar sessão</button></section>
    </section>
  </main>;
};
