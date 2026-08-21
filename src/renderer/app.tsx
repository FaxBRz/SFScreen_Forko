import { type KeyboardEvent, type ReactElement } from 'react';
import { formatSessionCode } from '../shared/session/code';
import type { TailscaleState, TailscaleStatus } from '../shared/session/types';
import { type SessionPhase } from './session/session-machine';
import { useSession } from './session/use-session';

const tailscaleGuidance: Record<TailscaleState, { title: string; detail: string }> = {
  ready: { title: 'Tailscale pronto', detail: 'Sua tailnet está disponível para encontrar e receber sessões.' },
  'not-installed': { title: 'Instale o Tailscale', detail: 'Instale o aplicativo Tailscale e entre na tailnet usada pelo SFScreen.' },
  'not-authenticated': { title: 'Entre na tailnet', detail: 'Abra o Tailscale, autentique este computador e volte para o SFScreen.' },
  offline: { title: 'Tailscale indisponível', detail: 'Verifique sua conexão e se o aplicativo Tailscale está em execução.' },
  'no-peers': { title: 'Nenhum peer online', detail: 'O outro computador precisa estar conectado à mesma tailnet.' },
  'policy-blocked': { title: 'Política bloqueada', detail: 'Revise os Grants da tailnet para liberar as portas do SFScreen.' },
};

const phaseIndex = (phase: SessionPhase): number => ({ checking: 0, idle: 0, hosting: 1, searching: 1, negotiating: 2, verifying: 3, connected: 4, failed: 0, closed: 0 })[phase];

const SignalIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h2v-2H4v2Zm4 0h2v-6H8v6Zm4 0h2V9h-2v10Zm4 0h2V5h-2v14Z" /></svg>;
const CopyIcon = (): ReactElement => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2Zm2 0h4a2 2 0 0 1 2 2v4h2V5h-8v2Zm4 2H6v10h8V9Z" /></svg>;

const TailscalePanel = ({ status, refresh }: { status: TailscaleStatus; refresh: () => Promise<TailscaleStatus | undefined> }): ReactElement => {
  const guidance = tailscaleGuidance[status.state];
  return <section className={`tailscale-panel ${status.state === 'ready' ? 'is-ready' : ''}`} aria-label="Diagnóstico do Tailscale">
    <div className="status-symbol"><SignalIcon /></div>
    <div><p className="section-kicker">Conectividade</p><h2>{guidance.title}</h2><p>{status.message ?? guidance.detail}</p>{status.state === 'ready' && <p className="peer-summary">{status.peers.length} peer(s) online · {status.selfIp}</p>}</div>
    <button className="button ghost" type="button" onClick={() => void refresh()}>Atualizar</button>
  </section>;
};

const Progress = ({ phase }: { phase: SessionPhase }): ReactElement => {
  const current = phaseIndex(phase);
  const labels = ['Pronto', 'Encontrar', 'Negociar', 'Verificar', 'Conectado'];
  return <ol className="progress" aria-label="Progresso da sessão">{labels.map((label, index) => <li key={label} className={index <= current ? 'complete' : ''}><span>{index + 1}</span>{label}</li>)}</ol>;
};

export const App = (): ReactElement => {
  const session = useSession();
  const { state } = session;
  const active = !['checking', 'idle', 'failed', 'closed'].includes(state.phase);
  const seconds = state.hosted ? Math.max(0, Math.ceil((Date.parse(state.hosted.expiresAt) - state.now) / 1_000)) : undefined;
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => { if (event.key === 'Enter') void session.join(); };

  return <main className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-mark">S</span><span>SFScreen</span></div><p className="version">V0.5 · conexão privada</p></header>
    <section className="hero"><p className="section-kicker">Compartilhamento seguro</p><h1>Conecte-se com clareza.</h1><p>Uma sessão privada entre computadores da sua tailnet. Sem arquivos, servidores próprios ou configurações complicadas durante a chamada.</p></section>
    <TailscalePanel status={state.tailscale} refresh={session.refresh} />
    <section className="session-grid" aria-label="Criar ou entrar em uma sessão">
      <article className="action-panel share-panel"><div className="panel-number">01</div><p className="section-kicker">Apresentar</p><h2>Compartilhe uma sessão</h2><p>Crie um código temporário para a pessoa que vai assistir.</p>{state.hosted ? <div className="invite-code" aria-live="polite"><span>{state.hosted.code}</span><button type="button" className="icon-button" aria-label="Copiar código" onClick={() => void session.copyCode()}><CopyIcon /></button><small>Expira em {seconds}s e pode ser usado uma vez.</small></div> : <button className="button primary" type="button" onClick={() => void session.host()} disabled={state.tailscale.state !== 'ready' || active}>Criar sessão</button>}</article>
      <article className="action-panel join-panel"><div className="panel-number">02</div><p className="section-kicker">Assistir</p><h2>Entre com um código</h2><p>Peça o código temporário ao apresentador e digite-o abaixo.</p><label className="code-label" htmlFor="session-code">Código da sessão</label><input id="session-code" className="code-input" value={formatSessionCode(session.joinCode)} onChange={(event) => session.setJoinCode(event.target.value)} onKeyDown={submitOnEnter} placeholder="XXX-XXX-X" maxLength={9} inputMode="text" autoCapitalize="characters" autoComplete="off" disabled={active} /><button className="button secondary" type="button" onClick={() => void session.join()} disabled={state.tailscale.state !== 'ready' || active || session.joinCode.length !== 7}>Conectar</button></article>
    </section>
    <section className="session-card" aria-live="polite"><div className="session-heading"><div><p className="section-kicker">Estado da sessão</p><h2>{state.phase === 'connected' ? 'Conexão verificada' : state.message}</h2></div>{active && <button className="button ghost danger" type="button" onClick={() => void session.close()}>Encerrar</button>}</div><Progress phase={state.phase} />{state.error && <p className="error-message" role="alert">{state.error}</p>}{state.securityCode && <div className="verification"><p className="section-kicker">Verificação criptográfica</p><div className="security-code">{state.securityCode}</div><p>Compare estes seis dígitos por um canal externo antes de confirmar.</p><button className="button primary" type="button" onClick={session.confirmSecurity} disabled={state.localConfirmed}>O código confere</button><p className="confirmation">{state.localConfirmed ? 'Você confirmou.' : 'Aguardando sua confirmação.'} {state.remoteConfirmed ? 'A outra pessoa confirmou.' : 'Aguardando a outra pessoa.'}</p></div>}{state.phase === 'connected' && <p className="route-badge">Rota Tailscale: <strong>{state.route}</strong></p>}</section>
  </main>;
};
