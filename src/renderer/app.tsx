import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatSessionCode } from "../shared/session/code";
import type { ScreenSource } from "../shared/screen-source";
import type { TailscaleState, TailscaleStatus } from "../shared/session/types";
import { type SessionPhase } from "./session/session-machine";
import { type SessionModel, useSession } from "./session/use-session";

const tailscaleGuidance: Record<TailscaleState, { title: string; detail: string }> = {
  ready: { title: "Tailscale pronto", detail: "Sua tailnet está disponível para encontrar e receber sessões." },
  "not-installed": { title: "Instale o Tailscale", detail: "Instale o aplicativo Tailscale e entre na tailnet usada pelo SFScreen." },
  "not-authenticated": { title: "Entre na tailnet", detail: "Abra o Tailscale, autentique este computador e volte para o SFScreen." },
  offline: { title: "Tailscale indisponível", detail: "Verifique sua conexão e se o aplicativo Tailscale está em execução." },
  "no-peers": { title: "Nenhum peer online", detail: "O outro computador precisa estar conectado à mesma tailnet." },
  "policy-blocked": { title: "Política bloqueada", detail: "Revise os Grants da tailnet para liberar as portas do SFScreen." },
};

const phaseIndex = (phase: SessionPhase): number => ({
  checking: 0,
  idle: 0,
  hosting: 1,
  searching: 1,
  negotiating: 2,
  verifying: 3,
  connected: 4,
  failed: 0,
  closed: 0,
})[phase];

const SignalIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h2v-2H4v2Zm4 0h2v-6H8v6Zm4 0h2V9h-2v10Zm4 0h2V5h-2v14Z" /></svg>;
const CopyIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2Zm2 0h4a2 2 0 0 1 2 2v4h2V5h-8v2Zm4 2H6v10h8V9Z" /></svg>;
const ShareIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11h-7v2h4v2H7v-2h4v-2H4V5Zm2 2v7h12V7H6Zm9.5 1.5 3 3-3 3-1.4-1.4.6-.6H11v-2h3.7l-.6-.6 1.4-1.4Z" /></svg>;
const StopIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z" /></svg>;
const FullscreenIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h6v2H7v4H5V5Zm8 0h6v6h-2V7h-4V5ZM5 13h2v4h4v2H5v-6Zm12 0h2v6h-6v-2h4v-4Z" /></svg>;
const MinimizeIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5z" /></svg>;
const SoundIcon = ({ muted }: { muted: boolean }): ReactElement => muted
  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4V9Zm12.3.3 4.4 4.4-1.4 1.4-4.4-4.4 1.4-1.4Zm3-1.4 1.4 1.4-4.4 4.4-1.4-1.4 4.4-4.4Z" /></svg>
  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4V9Zm12.5-.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2l1.4-1.4Zm2.8-2.8a9 9 0 0 1 0 12.6l-1.4-1.4a7 7 0 0 0 0-9.8l1.4-1.4Z" /></svg>;
const HangupIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 15.7 2.8 12.9C5.4 10.3 8.4 9 12 9s6.6 1.3 9.2 3.9l-1.4 2.8-3.3-1.2.2-2.1a12 12 0 0 0-9.4 0l.2 2.1-3.3 1.2Z" /></svg>;
const InfoIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 10h2v7h-2v-7Zm0-3h2v2h-2V7Zm1-4a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" /></svg>;

const TailscalePanel = ({ status, refresh }: { status: TailscaleStatus; refresh: () => Promise<TailscaleStatus | undefined> }): ReactElement => {
  const guidance = tailscaleGuidance[status.state];
  return (
    <section className={`tailscale-panel ${status.state === "ready" ? "is-ready" : ""}`} aria-label="Diagnóstico do Tailscale">
      <div className="status-symbol"><SignalIcon /></div>
      <div>
        <p className="section-kicker">Conectividade</p>
        <h2>{guidance.title}</h2>
        <p>{status.message ?? guidance.detail}</p>
        {status.state === "ready" && <p className="peer-summary">{status.peers.length} peer(s) online · {status.selfIp}</p>}
      </div>
      <button className="button ghost" type="button" onClick={() => void refresh()}>Atualizar</button>
    </section>
  );
};

const Progress = ({ phase }: { phase: SessionPhase }): ReactElement => {
  const current = phaseIndex(phase);
  const labels = ["Pronto", "Encontrar", "Negociar", "Verificar", "Conectado"];
  return <ol className="progress" aria-label="Progresso da sessão">{labels.map((label, index) => <li key={label} className={index <= current ? "complete" : ""}><span>{index + 1}</span>{label}</li>)}</ol>;
};

const Video = ({ stream, muted = false, volume = 1, className }: { stream?: MediaStream; muted?: boolean; volume?: number; className?: string }): ReactElement => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream ?? null;
    ref.current.volume = volume;
    if (stream) void ref.current.play().catch(() => undefined);
  }, [stream, volume]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
};

const SourceModal = ({ sources, onClose, onSelect }: { sources: ScreenSource[]; onClose: () => void; onSelect: (source: ScreenSource, includeSystemAudio: boolean) => Promise<void> }): ReactElement => {
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Compartilhar tela</p>
            <h2 id="source-title">Escolha o que compartilhar</h2>
            <p>Selecione um monitor. Se você já estiver transmitindo, a troca acontece sem derrubar a sessão.</p>
          </div>
          <button className="button ghost" type="button" onClick={onClose}>Fechar</button>
        </div>
        <label className="audio-option">
          <input type="checkbox" checked={includeSystemAudio} onChange={(event) => setIncludeSystemAudio(event.target.checked)} />
          <span><strong>Compartilhar áudio do sistema</strong><small>Opcional. O SFScreen tenta evitar recapturar o próprio áudio; outros apps ainda fazem parte do mix do Windows.</small></span>
        </label>
        <div className="source-grid">
          {sources.map((source) => (
            <button key={source.id} className="source-card" type="button" onClick={() => void onSelect(source, includeSystemAudio)}>
              <img src={source.thumbnailDataUrl} alt="" />
              <span>{source.name}</span>
            </button>
          ))}
        </div>
        {sources.length === 0 && <p className="error-message">Nenhum monitor disponível no momento.</p>}
      </section>
    </div>
  );
};

type FocusedStream = "local" | "remote";

const ActiveSession = ({ session }: { session: SessionModel }): ReactElement => {
  const { state } = session;
  const localSharing = state.mediaPhase === "sharing" && !!session.localStream;
  const remotePhase = session.remoteMediaPhase ?? "stopped";
  const remoteSharing = remotePhase === "sharing" && !!session.remoteStream;
  const [focused, setFocused] = useState<FocusedStream>(remoteSharing ? "remote" : "local");
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused === "remote" && !remoteSharing && localSharing) setFocused("local");
    if (focused === "local" && !localSharing && remoteSharing) setFocused("remote");
  }, [focused, localSharing, remoteSharing]);

  const focusedIsLocal = focused === "local";
  const focusedSharing = focusedIsLocal ? localSharing : remoteSharing;
  const focusedStream = focusedIsLocal ? session.localStream : session.remoteStream;
  const otherSharing = focusedIsLocal ? remoteSharing : localSharing;
  const focusedTitle = focusedIsLocal ? "Sua tela" : "Tela da outra pessoa";
  const focusedSubtitle = focusedIsLocal
    ? (state.selectedSource?.name ?? "Nenhum monitor compartilhado")
    : (remotePhase === "starting" ? "Iniciando compartilhamento…" : remotePhase === "failed" ? (session.remoteMediaError ?? "Falha no compartilhamento remoto") : "Compartilhamento remoto");

  const requestFullscreen = (): void => { void stageRef.current?.requestFullscreen?.(); };
  const swapFocus = (): void => {
    if (!otherSharing) return;
    setFocused(focusedIsLocal ? "remote" : "local");
  };

  return (
    <main className="active-call-shell">
      <header className="call-topbar">
        <div className="call-brand"><span className="brand-mark">S</span><div><strong>SFScreen</strong><small><span className="live-dot" /> Sessão conectada</small></div></div>
        <div className="call-meta"><span>Rota <strong>{state.route}</strong></span><span>DTLS-SRTP</span></div>
      </header>

      <section className="call-layout">
        <div ref={stageRef} className={`focused-stage ${focusedSharing ? "is-live" : "is-idle"}`}>
          {focusedSharing && focusedStream ? (
            <Video stream={focusedStream} muted={focusedIsLocal || remoteMuted} volume={focusedIsLocal ? 0 : remoteVolume} className="focused-video" />
          ) : (
            <div className="focused-empty"><div className="participant-avatar">{focusedIsLocal ? "V" : "P"}</div><h2>{focusedTitle}</h2><p>{focusedIsLocal ? "Escolha um monitor para começar a compartilhar." : "Aguardando a outra pessoa compartilhar a tela."}</p></div>
          )}

          <div className="stream-label"><strong>{focusedTitle}</strong><span>{focusedSubtitle}</span></div>

          <div className="stage-hover-controls">
            {otherSharing && <button className="round-control" type="button" aria-label="Reduzir e trocar tela em foco" title="Reduzir" onClick={swapFocus}><MinimizeIcon /></button>}
            <button className="round-control" type="button" aria-label="Tela cheia" title="Tela cheia" onClick={requestFullscreen}><FullscreenIcon /></button>
            {!focusedIsLocal && remoteSharing && <button className={`round-control ${remoteMuted ? "" : "is-active"}`} type="button" aria-label={remoteMuted ? "Ativar som" : "Silenciar"} title={remoteMuted ? "Ativar som" : "Silenciar"} onClick={() => setRemoteMuted((value) => !value)}><SoundIcon muted={remoteMuted} /></button>}
          </div>
        </div>

        <aside className="participant-rail" aria-label="Compartilhamentos da sessão">
          <button className={`participant-tile ${focused === "remote" ? "is-focused" : ""}`} type="button" onClick={() => setFocused("remote")} aria-label="Ver tela da outra pessoa">
            <div className="tile-preview">{remoteSharing && session.remoteStream ? <Video stream={session.remoteStream} muted className="tile-video" /> : <div className="tile-avatar">P</div>}</div>
            <div className="tile-footer"><span><strong>Outra pessoa</strong><small>{remoteSharing ? "Compartilhando" : remotePhase === "starting" ? "Iniciando…" : "Sem tela"}</small></span>{remoteSharing && <span className="live-pill">AO VIVO</span>}</div>
          </button>

          <button className={`participant-tile ${focused === "local" ? "is-focused" : ""}`} type="button" onClick={() => setFocused("local")} aria-label="Ver minha tela">
            <div className="tile-preview">{localSharing && session.localStream ? <Video stream={session.localStream} muted className="tile-video" /> : <div className="tile-avatar">V</div>}</div>
            <div className="tile-footer"><span><strong>Você</strong><small>{localSharing ? (state.selectedSource?.name ?? "Compartilhando") : state.selectedSource ? `Pronto: ${state.selectedSource.name}` : "Sem tela"}</small></span>{localSharing && <span className="live-pill">AO VIVO</span>}</div>
          </button>
        </aside>
      </section>

      {(state.mediaError || session.remoteMediaError) && <div className="call-error" role="alert">{state.mediaError ?? session.remoteMediaError}</div>}

      <div className="call-dock" aria-label="Controles da sessão">
        <button className="dock-button" type="button" aria-label={localSharing ? "Trocar monitor" : "Escolher monitor"} title={localSharing ? "Trocar monitor" : "Escolher monitor"} onClick={() => void session.openSourcePicker()}><ShareIcon /><span>{localSharing ? "Trocar tela" : "Escolher tela"}</span></button>
        {!localSharing && state.selectedSource && <button className="dock-button is-accent" type="button" aria-label="Iniciar compartilhamento" title="Iniciar compartilhamento" onClick={() => void session.startSharing()}><ShareIcon /><span>Compartilhar</span></button>}
        {localSharing && <button className="dock-button" type="button" aria-label="Parar compartilhamento" title="Parar compartilhamento" onClick={() => void session.stopSharing()}><StopIcon /><span>Parar tela</span></button>}
        {remoteSharing && <button className={`dock-button ${remoteMuted ? "" : "is-accent"}`} type="button" aria-label={remoteMuted ? "Ativar som remoto" : "Silenciar som remoto"} title={remoteMuted ? "Ativar som" : "Silenciar"} onClick={() => setRemoteMuted((value) => !value)}><SoundIcon muted={remoteMuted} /><span>{remoteMuted ? "Som" : "Silenciar"}</span></button>}
        {remoteSharing && !remoteMuted && <label className="dock-volume" title="Volume remoto"><input aria-label="Volume remoto" type="range" min="0" max="1" step="0.05" value={remoteVolume} onChange={(event) => setRemoteVolume(Number(event.target.value))} /></label>}
        <button className="dock-button" type="button" aria-label="Tela cheia" title="Tela cheia" onClick={requestFullscreen}><FullscreenIcon /><span>Tela cheia</span></button>
        <button className="dock-button" type="button" aria-label="Exportar diagnóstico" title="Diagnóstico" onClick={() => void session.exportDiagnostics()}><InfoIcon /><span>Diagnóstico</span></button>
        <button className="dock-button is-danger" type="button" aria-label="Encerrar sessão" title="Encerrar" onClick={() => void session.close()}><HangupIcon /><span>Encerrar</span></button>
      </div>
    </main>
  );
};

export const App = (): ReactElement => {
  const session = useSession();
  const { state } = session;
  const active = !["checking", "idle", "failed", "closed", "connected"].includes(state.phase);
  const seconds = state.hosted ? Math.max(0, Math.ceil((Date.parse(state.hosted.expiresAt) - state.now) / 1_000)) : undefined;
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => { if (event.key === "Enter") void session.join(); };
  const connected = state.phase === "connected";

  if (connected) {
    return (
      <>
        <ActiveSession session={session} />
        {session.sourcePickerOpen && <SourceModal sources={session.sources} onClose={session.closeSourcePicker} onSelect={session.selectSource} />}
      </>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header"><div className="brand"><span className="brand-mark">S</span><span>SFScreen</span></div><p className="version">V1.3 · teste privado</p></header>
      <section className="hero"><p className="section-kicker">Compartilhamento seguro</p><h1>Conecte-se com clareza.</h1><p>Uma sessão privada entre computadores da sua tailnet. Os dois lados podem compartilhar a própria tela depois da verificação bilateral.</p></section>
      <TailscalePanel status={state.tailscale} refresh={session.refresh} />

      <section className="session-grid" aria-label="Criar ou entrar em uma sessão">
        <article className="action-panel share-panel">
          <div className="panel-number">01</div><p className="section-kicker">Criar</p><h2>Compartilhe uma sessão</h2>
          <p>{state.selectedSource ? `Monitor pronto: ${state.selectedSource.name}` : "Escolha o monitor antes de criar um código temporário."}</p>
          {state.hosted ? (
            <div className="invite-code" aria-live="polite"><span>{state.hosted.code}</span><button type="button" className="icon-button" aria-label="Copiar código" onClick={() => void session.copyCode()}><CopyIcon /></button><small>Expira em {seconds}s e pode ser usado uma vez.</small></div>
          ) : (
            <div className="share-actions"><button className="button secondary" type="button" onClick={() => void session.openSourcePicker()} disabled={state.tailscale.state !== "ready" || active}>{state.selectedSource ? "Trocar monitor" : "Escolher monitor"}</button><button className="button primary" type="button" onClick={() => void session.host()} disabled={state.tailscale.state !== "ready" || active || !state.selectedSource}>Criar sessão</button></div>
          )}
        </article>

        <article className="action-panel join-panel">
          <div className="panel-number">02</div><p className="section-kicker">Entrar</p><h2>Entre com um código</h2><p>Peça o código temporário à outra pessoa e digite-o abaixo.</p>
          <label className="code-label" htmlFor="session-code">Código da sessão</label>
          <input id="session-code" className="code-input" value={formatSessionCode(session.joinCode)} onChange={(event) => session.setJoinCode(event.target.value)} onKeyDown={submitOnEnter} placeholder="XXX-XXX-X" maxLength={9} inputMode="text" autoCapitalize="characters" autoComplete="off" disabled={active} />
          <button className="button secondary" type="button" onClick={() => void session.join()} disabled={state.tailscale.state !== "ready" || active || session.joinCode.length !== 7}>Conectar</button>
        </article>
      </section>

      <section className="session-card" aria-live="polite">
        <div className="session-heading"><div><p className="section-kicker">Estado da sessão</p><h2>{state.message}</h2></div><div className="stage-actions">{state.phase === "failed" && <button className="button ghost" type="button" onClick={() => void session.exportDiagnostics()}>Exportar diagnóstico</button>}{active && <button className="button ghost danger" type="button" onClick={() => void session.close()}>Encerrar</button>}</div></div>
        <Progress phase={state.phase} />
        {state.error && <p className="error-message" role="alert">{state.error}</p>}
        {state.securityCode && (
          <div className="verification"><p className="section-kicker">Verificação criptográfica</p><div className="security-code">{state.securityCode}</div><p>Compare estes seis dígitos por um canal externo antes de confirmar.</p><button className="button primary" type="button" onClick={session.confirmSecurity} disabled={state.localConfirmed}>O código confere</button><p className="confirmation">{state.localConfirmed ? "Você confirmou." : "Aguardando sua confirmação."} {state.remoteConfirmed ? "A outra pessoa confirmou." : "Aguardando a outra pessoa."}</p></div>
        )}
      </section>

      {session.sourcePickerOpen && <SourceModal sources={session.sources} onClose={session.closeSourcePicker} onSelect={session.selectSource} />}
    </main>
  );
};
