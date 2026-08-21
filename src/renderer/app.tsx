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

const tailscaleGuidance: Record<
  TailscaleState,
  { title: string; detail: string }
> = {
  ready: {
    title: "Tailscale pronto",
    detail: "Sua tailnet está disponível para encontrar e receber sessões.",
  },
  "not-installed": {
    title: "Instale o Tailscale",
    detail:
      "Instale o aplicativo Tailscale e entre na tailnet usada pelo SFScreen.",
  },
  "not-authenticated": {
    title: "Entre na tailnet",
    detail:
      "Abra o Tailscale, autentique este computador e volte para o SFScreen.",
  },
  offline: {
    title: "Tailscale indisponível",
    detail:
      "Verifique sua conexão e se o aplicativo Tailscale está em execução.",
  },
  "no-peers": {
    title: "Nenhum peer online",
    detail: "O outro computador precisa estar conectado à mesma tailnet.",
  },
  "policy-blocked": {
    title: "Política bloqueada",
    detail: "Revise os Grants da tailnet para liberar as portas do SFScreen.",
  },
};

const phaseIndex = (phase: SessionPhase): number =>
  ({
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
const SignalIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 19h2v-2H4v2Zm4 0h2v-6H8v6Zm4 0h2V9h-2v10Zm4 0h2V5h-2v14Z" />
  </svg>
);
const CopyIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2Zm2 0h4a2 2 0 0 1 2 2v4h2V5h-8v2Zm4 2H6v10h8V9Z" />
  </svg>
);

const TailscalePanel = ({
  status,
  refresh,
}: {
  status: TailscaleStatus;
  refresh: () => Promise<TailscaleStatus | undefined>;
}): ReactElement => {
  const guidance = tailscaleGuidance[status.state];
  return (
    <section
      className={`tailscale-panel ${status.state === "ready" ? "is-ready" : ""}`}
      aria-label="Diagnóstico do Tailscale"
    >
      <div className="status-symbol">
        <SignalIcon />
      </div>
      <div>
        <p className="section-kicker">Conectividade</p>
        <h2>{guidance.title}</h2>
        <p>{status.message ?? guidance.detail}</p>
        {status.state === "ready" && (
          <p className="peer-summary">
            {status.peers.length} peer(s) online · {status.selfIp}
          </p>
        )}
      </div>
      <button
        className="button ghost"
        type="button"
        onClick={() => void refresh()}
      >
        Atualizar
      </button>
    </section>
  );
};

const Progress = ({ phase }: { phase: SessionPhase }): ReactElement => {
  const current = phaseIndex(phase);
  const labels = ["Pronto", "Encontrar", "Negociar", "Verificar", "Conectado"];
  return (
    <ol className="progress" aria-label="Progresso da sessão">
      {labels.map((label, index) => (
        <li key={label} className={index <= current ? "complete" : ""}>
          <span>{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
};

const Video = ({
  stream,
  muted = false,
  volume = 1,
}: {
  stream?: MediaStream;
  muted?: boolean;
  volume?: number;
}): ReactElement => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
    if (ref.current) ref.current.volume = volume;
    if (stream) void ref.current?.play().catch(() => undefined);
  }, [stream, volume]);
  return <video ref={ref} autoPlay playsInline muted={muted} />;
};

const SourceModal = ({
  sources,
  onClose,
  onSelect,
}: {
  sources: ScreenSource[];
  onClose: () => void;
  onSelect: (
    source: ScreenSource,
    includeSystemAudio: boolean,
  ) => Promise<void>;
}): ReactElement => {
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="source-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-title"
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Monitor</p>
            <h2 id="source-title">Escolha o que compartilhar</h2>
            <p>
              Compartilhe um monitor; janelas e microfone permanecem
              indisponíveis.
            </p>
          </div>
          <button className="button ghost" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <label className="audio-option">
          <input
            type="checkbox"
            checked={includeSystemAudio}
            onChange={(event) => setIncludeSystemAudio(event.target.checked)}
          />{" "}
          <span>
            <strong>Compartilhar áudio do sistema</strong>
            <small>
              Opcional e desligado por padrão. O som continua tocando neste PC.
            </small>
          </span>
        </label>
        <div className="source-grid">
          {sources.map((source) => (
            <button
              key={source.id}
              className="source-card"
              type="button"
              onClick={() => void onSelect(source, includeSystemAudio)}
            >
              <img src={source.thumbnailDataUrl} alt="" />
              <span>{source.name}</span>
            </button>
          ))}
        </div>
        {sources.length === 0 && (
          <p className="error-message">Nenhum monitor disponível no momento.</p>
        )}
      </section>
    </div>
  );
};

const Stage = ({ session }: { session: SessionModel }): ReactElement => {
  const { state } = session;
  const host = state.role === "host";
  const isSharing = state.mediaPhase === "sharing";
  const [viewerMuted, setViewerMuted] = useState(true);
  const [viewerVolume, setViewerVolume] = useState(1);
  const stageMessage =
    state.mediaPhase === "starting"
      ? "Iniciando compartilhamento…"
      : state.mediaPhase === "stopped"
        ? "Compartilhamento pausado"
        : state.mediaPhase === "failed"
          ? (state.mediaError ?? "Não foi possível iniciar o compartilhamento.")
          : "Aguardando o apresentador iniciar o compartilhamento";
  return (
    <section className="video-stage" aria-label="Palco de compartilhamento">
      <div className="stage-heading">
        <div>
          <p className="section-kicker">Sessão verificada</p>
          <h2>{host ? "Seu monitor" : "Tela compartilhada"}</h2>
          <p>
            {host
              ? "A captura só começa quando você clicar em iniciar."
              : "O vídeo aparecerá aqui quando o apresentador iniciar."}
          </p>
        </div>
        <div className="stage-actions">
          <span className="route-badge">
            Rota: <strong>{state.route}</strong>
          </span>
          <button
            className="button ghost"
            type="button"
            onClick={() => void session.exportDiagnostics()}
          >
            Exportar diagnóstico
          </button>
          <button
            className="button ghost danger"
            type="button"
            onClick={() => void session.close()}
          >
            Encerrar
          </button>
        </div>
      </div>
      {host ? (
        <>
          <div className={`video-frame ${isSharing ? "" : "is-empty"}`}>
            {isSharing && <Video stream={session.localStream} muted />}
            {!isSharing && (
              <div className="empty-stage">
                <p>
                  {state.selectedSource
                    ? `Monitor selecionado: ${state.selectedSource.name}`
                    : "Escolha um monitor para continuar."}
                </p>
              </div>
            )}
          </div>
          <div className="audio-status">
            Áudio do sistema:{" "}
            <strong>
              {state.audioPhase === "active"
                ? "ativo"
                : state.audioPhase === "starting"
                  ? "iniciando"
                  : state.audioPhase === "stopped"
                    ? "parado"
                    : state.audioPhase === "failed"
                      ? "falhou"
                      : "sem áudio"}
            </strong>
            {state.audioError && <span> · {state.audioError}</span>}
          </div>
          {state.mediaError && (
            <p className="error-message" role="alert">
              {state.mediaError}
            </p>
          )}
          <div className="stage-controls">
            <button
              className="button secondary"
              type="button"
              onClick={() => void session.openSourcePicker()}
            >
              {state.selectedSource ? "Trocar monitor" : "Escolher monitor"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={
                !state.selectedSource || state.mediaPhase === "starting"
              }
              onClick={() => void session.startSharing()}
            >
              {isSharing
                ? "Compartilhar este monitor"
                : "Iniciar compartilhamento"}
            </button>
            {isSharing && state.audioPhase === "active" && (
              <button
                className="button ghost"
                type="button"
                onClick={() => void session.stopAudio()}
              >
                Parar áudio
              </button>
            )}
            {isSharing && (
              <button
                className="button ghost danger"
                type="button"
                onClick={() => void session.stopSharing()}
              >
                Parar
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div
            className={`video-frame ${session.remoteStream && isSharing ? "" : "is-empty"}`}
          >
            {session.remoteStream && isSharing ? (
              <Video
                stream={session.remoteStream}
                muted={viewerMuted}
                volume={viewerVolume}
              />
            ) : (
              <div className="empty-stage">
                <p>{stageMessage}</p>
              </div>
            )}
          </div>
          {session.remoteStream && isSharing && (
            <div className="viewer-controls">
              <button
                className="button secondary"
                type="button"
                onClick={() => setViewerMuted((muted) => !muted)}
              >
                {viewerMuted ? "Ativar som" : "Silenciar"}
              </button>
              <label>
                Volume
                <input
                  aria-label="Volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={viewerVolume}
                  onChange={(event) =>
                    setViewerVolume(Number(event.target.value))
                  }
                />
              </label>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  document
                    .querySelector(".video-frame video")
                    ?.requestFullscreen?.()
                }
              >
                Tela cheia
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export const App = (): ReactElement => {
  const session = useSession();
  const { state } = session;
  const active = ![
    "checking",
    "idle",
    "failed",
    "closed",
    "connected",
  ].includes(state.phase);
  const seconds = state.hosted
    ? Math.max(
        0,
        Math.ceil((Date.parse(state.hosted.expiresAt) - state.now) / 1_000),
      )
    : undefined;
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") void session.join();
  };
  const connected = state.phase === "connected";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>SFScreen</span>
        </div>
        <p className="version">V1.2 · teste privado</p>
      </header>
      {connected ? (
        <Stage session={session} />
      ) : (
        <>
          <section className="hero">
            <p className="section-kicker">Compartilhamento seguro</p>
            <h1>Conecte-se com clareza.</h1>
            <p>
              Uma sessão privada entre computadores da sua tailnet. Escolha o
              monitor agora; a captura só começa depois da verificação
              bilateral.
            </p>
          </section>
          <TailscalePanel status={state.tailscale} refresh={session.refresh} />
          <section
            className="session-grid"
            aria-label="Criar ou entrar em uma sessão"
          >
            <article className="action-panel share-panel">
              <div className="panel-number">01</div>
              <p className="section-kicker">Apresentar</p>
              <h2>Compartilhe uma sessão</h2>
              <p>
                {state.selectedSource
                  ? `Monitor pronto: ${state.selectedSource.name}`
                  : "Escolha o monitor antes de criar um código temporário."}
              </p>
              {state.hosted ? (
                <div className="invite-code" aria-live="polite">
                  <span>{state.hosted.code}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Copiar código"
                    onClick={() => void session.copyCode()}
                  >
                    <CopyIcon />
                  </button>
                  <small>Expira em {seconds}s e pode ser usado uma vez.</small>
                </div>
              ) : (
                <div className="share-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void session.openSourcePicker()}
                    disabled={state.tailscale.state !== "ready" || active}
                  >
                    {state.selectedSource
                      ? "Trocar monitor"
                      : "Escolher monitor"}
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void session.host()}
                    disabled={
                      state.tailscale.state !== "ready" ||
                      active ||
                      !state.selectedSource
                    }
                  >
                    Criar sessão
                  </button>
                </div>
              )}
            </article>
            <article className="action-panel join-panel">
              <div className="panel-number">02</div>
              <p className="section-kicker">Assistir</p>
              <h2>Entre com um código</h2>
              <p>Peça o código temporário ao apresentador e digite-o abaixo.</p>
              <label className="code-label" htmlFor="session-code">
                Código da sessão
              </label>
              <input
                id="session-code"
                className="code-input"
                value={formatSessionCode(session.joinCode)}
                onChange={(event) => session.setJoinCode(event.target.value)}
                onKeyDown={submitOnEnter}
                placeholder="XXX-XXX-X"
                maxLength={9}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={active}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() => void session.join()}
                disabled={
                  state.tailscale.state !== "ready" ||
                  active ||
                  session.joinCode.length !== 7
                }
              >
                Conectar
              </button>
            </article>
          </section>
          <section className="session-card" aria-live="polite">
            <div className="session-heading">
              <div>
                <p className="section-kicker">Estado da sessão</p>
                <h2>{state.message}</h2>
              </div>
              <div className="stage-actions">
                {state.phase === "failed" && (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => void session.exportDiagnostics()}
                  >
                    Exportar diagnóstico
                  </button>
                )}
                {active && (
                  <button
                    className="button ghost danger"
                    type="button"
                    onClick={() => void session.close()}
                  >
                    Encerrar
                  </button>
                )}
              </div>
            </div>
            <Progress phase={state.phase} />
            {state.error && (
              <p className="error-message" role="alert">
                {state.error}
              </p>
            )}
            {state.securityCode && (
              <div className="verification">
                <p className="section-kicker">Verificação criptográfica</p>
                <div className="security-code">{state.securityCode}</div>
                <p>
                  Compare estes seis dígitos por um canal externo antes de
                  confirmar.
                </p>
                <button
                  className="button primary"
                  type="button"
                  onClick={session.confirmSecurity}
                  disabled={state.localConfirmed}
                >
                  O código confere
                </button>
                <p className="confirmation">
                  {state.localConfirmed
                    ? "Você confirmou."
                    : "Aguardando sua confirmação."}{" "}
                  {state.remoteConfirmed
                    ? "A outra pessoa confirmou."
                    : "Aguardando a outra pessoa."}
                </p>
              </div>
            )}
          </section>
        </>
      )}
      {session.sourcePickerOpen && (
        <SourceModal
          sources={session.sources}
          onClose={session.closeSourcePicker}
          onSelect={session.selectSource}
        />
      )}
    </main>
  );
};
