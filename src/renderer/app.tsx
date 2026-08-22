import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { formatSessionCode } from "../shared/session/code";
import type { ScreenSource } from "../shared/screen-source";
import { type SessionModel, useSession } from "./session/use-session";

/* ─── Vector Icons (Sleek, Minimalist, No Emojis) ─── */
const BrandIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="14" x="3" y="3" rx="2" />
    <path d="M7 21h10" />
    <path d="M12 17v4" />
    <path d="m10 9 4 3-4 3V9z" fill="currentColor" stroke="none" />
  </svg>
);
const SidebarIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);
const UsersIcon = (): ReactElement => (

  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const SignalWifiIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h.01" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 13a10 10 0 0 1 14 0" /><path d="M1.5 9.5a15 15 0 0 1 21 0" />
  </svg>
);
const LockShieldIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const GearIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const CrownIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
  </svg>
);
const ScreenCastIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M12 17v4" /><path d="M8 21h8" /><path d="m12 7-3 3h2v4h2v-4h2z" />
  </svg>
);
const ScreenSwitchIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M12 17v4" /><path d="M8 21h8" />
  </svg>
);

const SpeakerOnIcon = (): ReactElement => (

  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const SpeakerMuteIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" />
  </svg>
);
const MessageSquareIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ActivityIcon = (): ReactElement => (

  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const PhoneOffIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
const FullscreenIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const WindowMinimizeIcon = (): ReactElement => (

  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <line x1="1" x2="11" y1="6" y2="6" />
  </svg>
);
const WindowMaximizeIcon = (): ReactElement => (
  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <rect width="9" height="9" x="1.5" y="1.5" rx="1" />
  </svg>
);
const WindowCloseIcon = (): ReactElement => (
  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <line x1="2" x2="10" y1="2" y2="10" /><line x1="10" x2="2" y1="2" y2="10" />
  </svg>
);
const ClipboardCopyIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);
const CheckCircleIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const XCloseIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);
const SendIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const TrashIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

const CameraIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const MicMutedIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const SignalBarsIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 20h.01" /><path d="M7 20v-4" /><path d="M12 20v-8" /><path d="M17 20V4" />
  </svg>
);

const MonitorIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
  </svg>
);
const ServerIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);
const SlidersIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="1" x2="7" y1="14" y2="14" /><line x1="9" x2="15" y1="8" y2="8" /><line x1="17" x2="23" y1="16" y2="16" />
  </svg>
);
const UserCircleIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
  </svg>
);
const InfoCircleIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" />
  </svg>
);
const ChevronUpIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const ChevronRightIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const ScreenOffIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
const AlertCircleIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);
const ZoomInIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);
const ZoomOutIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);

const MoveIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" x2="22" y1="12" y2="12" /><line x1="12" x2="12" y1="2" y2="22" />
  </svg>
);
const EyeIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const GridViewIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);
const FocusViewIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" />
  </svg>
);
const EcoZapIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

/* ─── Profile Avatar Component (Supports Uploaded Photos & Initials) ─── */
interface UserAvatarProps {
  name: string;
  avatar?: string;
  className?: string;
  isSelf?: boolean;
}

const UserAvatar = ({ name, avatar, className = "", isSelf = false }: UserAvatarProps): ReactElement => {
  if (avatar) {
    return (
      <div className={`user-avatar-wrap ${className} ${isSelf ? "is-self" : ""}`}>
        <img src={avatar} alt={name} className="user-avatar-img" />
      </div>
    );
  }
  return (
    <div className={`user-avatar-wrap ${className} ${isSelf ? "is-self" : ""}`}>
      <span className="user-avatar-letter">{(name || "U").slice(0, 1).toUpperCase()}</span>
    </div>
  );
};








/* ─── Video Renderer ─── */
const Video = ({ stream, muted = false, volume = 1, className }: { stream?: MediaStream; muted?: boolean; volume?: number; className?: string }): ReactElement => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (ref.current.srcObject !== (stream ?? null)) {
      ref.current.srcObject = stream ?? null;
      if (stream) void ref.current.play()?.catch?.(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = Math.max(0, Math.min(1, volume));
      ref.current.muted = muted;
    }
  }, [volume, muted]);

  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
};



/* ─── Modal: Source Picker ─── */
const SourceModal = ({ sources, onClose, onSelect }: { sources: ScreenSource[]; onClose: () => void; onSelect: (source: ScreenSource, includeSystemAudio: boolean) => Promise<void> }): ReactElement => {
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <div className="modal-heading">
          <div className="modal-heading-text">
            <div className="modal-badge-row">
              <span className="live-dot-pulse" />
              <span className="section-kicker">Compartilhamento de Tela</span>
            </div>
            <h2 id="source-title">Escolha o que compartilhar</h2>
            <p className="modal-subtext">Selecione uma tela para iniciar a transmissão em alta definição (1080p · 60 FPS).</p>
          </div>
          <button className="button ghost icon-only modal-close-btn" type="button" onClick={onClose} aria-label="Fechar modal"><XCloseIcon /></button>
        </div>

        {/* Sleek Audio Toggle Card with iOS/Discord Switch */}
        <label className="audio-toggle-card">
          <div className="audio-toggle-icon">
            <SpeakerOnIcon />
          </div>
          <div className="audio-toggle-info">
            <span className="audio-toggle-title">Compartilhar áudio do sistema</span>
            <span className="audio-toggle-subtitle">Transmita o áudio de jogos e janelas (com filtro anti-eco do Discord).</span>
          </div>
          <div className="switch-toggle-wrapper">
            <input
              type="checkbox"
              className="switch-toggle-input"
              checked={includeSystemAudio}
              onChange={(event) => setIncludeSystemAudio(event.target.checked)}
              aria-label="Compartilhar áudio do sistema"
            />
            <div className={`switch-toggle-track ${includeSystemAudio ? "is-checked" : ""}`}>
              <div className="switch-toggle-thumb" />
            </div>
          </div>
        </label>

        <div className="source-section-header">
          <div className="source-section-title">
            <MonitorIcon />
            <span>Telas disponíveis ({sources.length})</span>
          </div>
        </div>

        <div className="source-grid">
          {sources.map((source, index) => (
            <button
              key={source.id}
              className="source-card"
              type="button"
              onClick={() => void onSelect(source, includeSystemAudio)}
              aria-label={source.name}
            >
              <div className="source-thumbnail-box">
                <img src={source.thumbnailDataUrl} alt={source.name} className="source-thumbnail-img" />
                <div className="source-overlay-hover">
                  <span className="source-hover-pill">
                    <ScreenCastIcon />
                    <span>Compartilhar</span>
                  </span>
                </div>
                <div className="source-resolution-badge">
                  <span>Monitor {index + 1}</span>
                </div>
              </div>
              <div className="source-card-footer">
                <div className="source-name-row">
                  <MonitorIcon />
                  <span className="source-card-name">{source.name}</span>
                </div>
                <span className="source-card-sub">Clique para transmitir</span>
              </div>
            </button>
          ))}
        </div>
        {sources.length === 0 && <p className="empty-warning">Nenhum monitor detectado.</p>}
      </section>
    </div>
  );
};


/* ─── Modal: Session & Invite ─── */
const SessionModal = ({ session, onClose }: { session: SessionModel; onClose: () => void }): ReactElement => {
  const { state } = session;
  const [tab, setTab] = useState<"invite" | "join">("invite");
  const [copied, setCopied] = useState(false);
  const seconds = state.hosted ? Math.max(0, Math.ceil((Date.parse(state.hosted.expiresAt) - state.now) / 1_000)) : undefined;

  const handleCopy = async (): Promise<void> => {
    if (!state.hosted) return;
    const text = state.hosted.code;
    let success = false;
    try {
      success = await session.copyCode();
    } catch {
      success = false;
    }
    if (!success) {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          success = true;
        }
      } catch {
        // Fallback
      }
    }
    if (!success) {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.top = "0";
        el.style.left = "0";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        success = true;
      } catch {
        success = false;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2_500);
  };

  const handleJoin = (event: FormEvent): void => {
    event.preventDefault();
    void session.join();
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="session-modal-panel" role="dialog" aria-modal="true" aria-labelledby="session-modal-title">
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Conexão Segura</p>
            <h2 id="session-modal-title">Conectar ou Convidar</h2>
          </div>
          <button className="button ghost icon-only" type="button" onClick={onClose} aria-label="Fechar"><XCloseIcon /></button>
        </div>

        {state.securityCode ? (
          <div className="verification-box">
            <p className="section-kicker">Verificação Criptográfica</p>
            <h3>Compare o código de segurança</h3>
            <div className="security-code-large" title="Selecione para copiar">{state.securityCode}</div>
            <p>Confirme estes seis dígitos com a outra pessoa antes de liberar a transmissão.</p>
            <button className="button primary full-width" type="button" onClick={session.confirmSecurity} disabled={state.localConfirmed}>
              {state.localConfirmed ? "Aguardando confirmação remota…" : "O código confere"}
            </button>
            <div className="confirmation-status-bar">
              <span className={state.localConfirmed ? "confirmed" : "pending"}>
                <CheckCircleIcon /> Você {state.localConfirmed ? "confirmou" : "pendente"}
              </span>
              <span className={state.remoteConfirmed ? "confirmed" : "pending"}>
                <CheckCircleIcon /> Remoto {state.remoteConfirmed ? "confirmou" : "pendente"}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="tab-pill-group">
              <button className={`tab-pill ${tab === "invite" ? "is-active" : ""}`} type="button" onClick={() => setTab("invite")}>Criar Convite</button>
              <button className={`tab-pill ${tab === "join" ? "is-active" : ""}`} type="button" onClick={() => setTab("join")}>Entrar com Código</button>
            </div>

            {tab === "invite" ? (
              <div className="tab-content">
                <p className="tab-description">Gere um código de uso único para receber um convidado na sua chamada.</p>
                {state.hosted ? (
                  <div className="invite-code-card">
                    <span
                      className="code-value"
                      title="Clique para copiar ou selecione o código"
                      onClick={() => void handleCopy()}
                    >
                      {state.hosted.code}
                    </span>
                    <button type="button" className="button primary copy-btn" onClick={() => void handleCopy()}>
                      <ClipboardCopyIcon />
                      <span>{copied ? "Copiado!" : "Copiar código"}</span>
                    </button>
                    <small className="code-timer">Expira em {seconds}s</small>
                  </div>
                ) : (

                  <div className="invite-action-box">
                    <button className="button primary full-width" type="button" onClick={() => void session.host()} disabled={state.tailscale.state !== "ready"}>
                      Gerar Código de Sessão
                    </button>
                    {state.tailscale.state !== "ready" && (
                      <p className="empty-warning">Tailscale não conectado. Inicie o app Tailscale.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <form className="tab-content" onSubmit={handleJoin}>
                <p className="tab-description">Digite o código temporário fornecido pelo apresentador.</p>
                <label className="code-label" htmlFor="join-code-input">Código da Sessão</label>
                <input
                  id="join-code-input"
                  className="code-input"
                  value={formatSessionCode(session.joinCode)}
                  onChange={(e) => session.setJoinCode(e.target.value)}
                  placeholder="XXX-XXX-X"
                  maxLength={9}
                  autoComplete="off"
                />
                <button className="button primary full-width" type="submit" disabled={state.tailscale.state !== "ready" || session.joinCode.length !== 7}>
                  Conectar
                </button>
              </form>
            )}
          </>
        )}

        {state.error && <p className="empty-warning" role="alert">{state.error}</p>}
      </section>
    </div>
  );
};

/* ─── Modal: Clean Tabbed Settings ─── */
type SettingsTab = "profile" | "network" | "media" | "diagnostics" | "testing" | "about";


const SettingsModal = ({
  session,
  onClose,
}: {
  session: SessionModel;
  onClose: () => void;
}): ReactElement => {
  const { state } = session;
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [name, setName] = useState(state.localUserName);
  const [avatar, setAvatar] = useState<string | undefined>(state.localUserAvatar);
  const [copiedDiag, setCopiedDiag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === "string") {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const size = 180;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            setAvatar(compressedDataUrl);
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = (e: FormEvent): void => {
    e.preventDefault();
    if (name.trim()) {
      session.setUserName(name.trim());
      session.setUserAvatar(avatar);
      onClose();
    }
  };


  const handleExportDiag = async (): Promise<void> => {
    const success = await session.exportDiagnostics();
    if (success) {
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 2500);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        {/* Settings Navigation Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-nav-header">
            <h3 id="settings-title">Configurações</h3>
          </div>
          <nav className="settings-nav-list">
            <button className={`settings-nav-item ${activeTab === "profile" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("profile")}>
              <UserCircleIcon /> <span>Perfil</span>
            </button>
            <button className={`settings-nav-item ${activeTab === "network" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("network")}>
              <ServerIcon /> <span>Rede & Tailscale</span>
            </button>
            <button className={`settings-nav-item ${activeTab === "media" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("media")}>
              <SlidersIcon /> <span>Vídeo & Áudio</span>
            </button>
            <button className={`settings-nav-item ${activeTab === "diagnostics" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("diagnostics")}>
              <ActivityIcon /> <span>Diagnóstico</span>
            </button>
            <button className={`settings-nav-item ${activeTab === "testing" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("testing")}>
              <ScreenCastIcon /> <span>Modo de Teste</span>
            </button>
            <button className={`settings-nav-item ${activeTab === "about" ? "is-active" : ""}`} type="button" onClick={() => setActiveTab("about")}>
              <InfoCircleIcon /> <span>Sobre</span>
            </button>
          </nav>
        </aside>

        {/* Settings Main Content */}
        <div className="settings-content-body">
          <div className="settings-header-row">
            <h2 className="settings-section-heading">
              {activeTab === "profile" && "Perfil de Usuário"}
              {activeTab === "network" && "Rede & Tailscale"}
              {activeTab === "media" && "Qualidade & Parâmetros de Mídia"}
              {activeTab === "diagnostics" && "Telemetria & Diagnóstico"}
              {activeTab === "testing" && "Simulador de Chamada e Testes"}
              {activeTab === "about" && "Sobre o SFScreen"}
            </h2>

            <button className="button ghost icon-only" type="button" onClick={onClose} aria-label="Fechar configurações">
              <XCloseIcon />
            </button>
          </div>

          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="settings-form">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={handleAvatarFileChange}
              />

              {/* Discord-Style Profile Banner & Live Card */}
              <div className="discord-profile-card">
                {/* Banner Top */}
                <div className="discord-profile-banner">
                  <div className="discord-profile-banner-ambient">
                    {avatar && <img src={avatar} alt="" aria-hidden="true" />}
                  </div>
                  <div className="discord-profile-banner-badge">
                    <span className="live-dot" />
                    <span>{state.role === "host" ? "Host da Sessão" : "Conectado"}</span>
                  </div>
                </div>

                {/* Avatar & Main Profile Header */}
                <div className="discord-profile-body">
                  <div className="discord-profile-avatar-row">
                    <div
                      className="discord-profile-avatar-box"
                      onClick={() => fileInputRef.current?.click()}
                      title="Clique para alterar a foto de perfil"
                      role="button"
                      tabIndex={0}
                    >
                      <UserAvatar name={name} avatar={avatar} isSelf className="discord-profile-avatar-img" />
                      <div className="discord-avatar-edit-overlay">
                        <CameraIcon />
                        <span>Trocar</span>
                      </div>
                      <span className="avatar-online-status-dot" title="Online" />
                    </div>

                    <div className="discord-profile-actions">
                      <button
                        type="button"
                        className="button outline small profile-action-btn"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <CameraIcon /> Alterar foto
                      </button>
                      {avatar && (
                        <button
                          type="button"
                          className="button ghost small is-danger profile-action-btn"
                          onClick={() => setAvatar(undefined)}
                        >
                          <TrashIcon /> Remover
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Profile Details Preview */}
                  <div className="discord-profile-info-block">
                    <h3 className="discord-profile-name-title">{name || "Seu Nome"}</h3>
                    <div className="discord-profile-badge-row">
                      <span className="discord-profile-tag">Você</span>
                      <span className="discord-profile-subtext">Foto e nome visíveis na chamada e no modo grade</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Field Section */}
              <div className="setting-field">
                <div className="setting-field-header">
                  <label className="code-label" htmlFor="settings-name-input">Nome de exibição</label>
                  <span className="char-counter">{name.length}/32</span>
                </div>
                <input
                  id="settings-name-input"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  placeholder="Ex: Xexo, Alex, etc."
                  autoComplete="off"
                />
                <p className="setting-field-hint">Como as outras pessoas verão você durante as transmissões e no chat.</p>
              </div>

              <div className="settings-actions-footer">
                <button className="button ghost" type="button" onClick={onClose}>Cancelar</button>
                <button className="button primary" type="submit" disabled={!name.trim()}>Salvar alterações</button>
              </div>
            </form>
          )}


          {activeTab === "network" && (
            <div className="settings-info-grid">
              <div className="setting-card">
                <span className="card-key">Status Tailscale</span>
                <span className="card-value status-highlight">
                  <span className={`status-dot ${state.tailscale.state === "ready" ? "is-online" : "is-offline"}`} />
                  {state.tailscale.state === "ready" ? "Pronto e conectado" : state.tailscale.state}
                </span>
              </div>
              <div className="setting-card">
                <span className="card-key">IP na Tailnet</span>
                <span className="card-value mono">{state.tailscale.selfIp ?? "Não atribuído"}</span>
              </div>
              <div className="setting-card">
                <span className="card-key">Peers Online</span>
                <span className="card-value">{state.tailscale.peers.length} peer(s)</span>
              </div>
              <div className="setting-card">
                <span className="card-key">Rota WebRTC</span>
                <span className="card-value mono">{state.phase === "connected" ? state.route : "P2P Direto"}</span>
              </div>
              <div className="setting-card full-span">
                <span className="card-key">Criptografia de Sinalização</span>
                <span className="card-value">DTLS-SRTP Bilateral com Verificação Criptográfica</span>
              </div>
            </div>
          )}

          {activeTab === "media" && (
            <div className="settings-info-grid">
              <div className="setting-card">
                <span className="card-key">Resolução Máxima</span>
                <span className="card-value">1920 × 1080 (Full HD)</span>
              </div>
              <div className="setting-card">
                <span className="card-key">Taxa de Quadros</span>
                <span className="card-value">60 FPS Fluido</span>
              </div>
              <div className="setting-card">
                <span className="card-key">Codec de Vídeo</span>
                <span className="card-value">VP8 (WebRTC Hardware Accel)</span>
              </div>
              <div className="setting-card">
                <span className="card-key">Isolamento de Áudio</span>
                <span className="card-value status-highlight">
                  <span className="status-dot is-online" />
                  WASAPI Filtered Loopback Ativo
                </span>
              </div>
              <div className="setting-card full-span">
                <span className="card-key">Proteção de Eco do Discord</span>
                <span className="card-value">O SFScreen exclui o som do aplicativo Discord automaticamente do mix transmitido.</span>
              </div>
            </div>
          )}

          {activeTab === "diagnostics" && (
            <div className="settings-info-grid">
              <div className="setting-card full-span">
                <span className="card-key">Diagnóstico em Tempo Real</span>
                <p className="modal-subtext">Gera um relatório detalhado com telemetria WebRTC, handshake ICE, candidatos SDP e eventos de mídia.</p>
                <div style={{ marginTop: "12px" }}>
                  <button className="button primary copy-btn" type="button" onClick={() => void handleExportDiag()}>
                    <ActivityIcon />
                    <span>{copiedDiag ? "Relatório Exportado!" : "Exportar Relatório JSON"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "testing" && (
            <div className="settings-info-grid">
              <div className="setting-card full-span">
                <span className="card-key">Simulador de Chamada e Transmissão Remota</span>
                <p className="modal-subtext" style={{ marginTop: "4px" }}>
                  Gera uma transmissão sintetizada em tempo real (1080p · 60 FPS com áudio, relógio e animação de latência) para você testar todas as funcionalidades de compartilhamento duplo, Picture-in-Picture (PiP), modo tela cheia, controles de áudio e otimizações de foco sem precisar de um segundo computador.
                </p>
                <div style={{ marginTop: "14px", display: "flex", gap: "10px" }}>
                  {session.isSimulatedPeer ? (
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        session.simulatePeer(false);
                      }}
                    >
                      Encerrar Participante Simulado
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => {
                        session.simulatePeer(true);
                        onClose();
                      }}
                    >
                      Iniciar Participante Simulado (Alex)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div className="settings-info-grid">
              <div className="setting-card full-span">
                <div className="about-brand-row">
                  <div className="brand-mark-clean"><BrandIcon /></div>
                  <div>
                    <strong>SFScreen</strong>
                    <small>Versão 0.1.3 · Ponto-a-Ponto Seguro</small>
                  </div>
                </div>
                <p className="modal-subtext" style={{ marginTop: "12px" }}>
                  Compartilhamento ultra-rápido de tela e áudio com baixa latência para computadores na mesma tailnet.
                </p>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  );
};

/* ─── Stream Start Sound Synthesizer (Discord-style Chime) ─── */
let audioContextInstance: AudioContext | null = null;

const playStreamStartSound = (): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextInstance) {
      audioContextInstance = new AudioContextClass();
    }
    if (audioContextInstance.state === "suspended") {
      void audioContextInstance.resume();
    }

    const now = audioContextInstance.currentTime;
    const notes = [
      { freq: 440.00, start: 0.00, dur: 0.12, gain: 0.10 }, // A4
      { freq: 554.37, start: 0.08, dur: 0.15, gain: 0.12 }, // C#5
      { freq: 659.25, start: 0.16, dur: 0.26, gain: 0.14 }, // E5
      { freq: 880.00, start: 0.22, dur: 0.42, gain: 0.16 }, // A5
    ];

    notes.forEach(({ freq, start, dur, gain: noteGain }) => {
      if (!audioContextInstance) return;
      const osc = audioContextInstance.createOscillator();
      const gainNode = audioContextInstance.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gainNode);
      gainNode.connect(audioContextInstance.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch {
    // Ignored in restricted environments
  }
};

const playStreamStopSound = (): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextInstance) {
      audioContextInstance = new AudioContextClass();
    }
    if (audioContextInstance.state === "suspended") {
      void audioContextInstance.resume();
    }

    const now = audioContextInstance.currentTime;
    const notes = [
      { freq: 880.00, start: 0.00, dur: 0.10, gain: 0.12 }, // A5
      { freq: 659.25, start: 0.07, dur: 0.12, gain: 0.11 }, // E5
      { freq: 440.00, start: 0.14, dur: 0.24, gain: 0.09 }, // A4
    ];

    notes.forEach(({ freq, start, dur, gain: noteGain }) => {
      if (!audioContextInstance) return;
      const osc = audioContextInstance.createOscillator();
      const gainNode = audioContextInstance.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gainNode);
      gainNode.connect(audioContextInstance.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch {
    // Ignored in restricted environments
  }
};

/* ─── Discord-style User Join Sound ─── */
const playUserJoinSound = (): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextInstance) audioContextInstance = new AudioContextClass();
    if (audioContextInstance.state === "suspended") void audioContextInstance.resume();
    const now = audioContextInstance.currentTime;
    const notes = [
      { freq: 440.00, start: 0.00, dur: 0.12, gain: 0.12 }, // A4
      { freq: 587.33, start: 0.09, dur: 0.28, gain: 0.15 }, // D5
    ];
    notes.forEach(({ freq, start, dur, gain: noteGain }) => {
      if (!audioContextInstance) return;
      const osc = audioContextInstance.createOscillator();
      const gainNode = audioContextInstance.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gainNode);
      gainNode.connect(audioContextInstance.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch {
    // Ignored in restricted environments
  }
};

/* ─── Discord-style User Leave Sound ─── */
const playUserLeaveSound = (): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextInstance) audioContextInstance = new AudioContextClass();
    if (audioContextInstance.state === "suspended") void audioContextInstance.resume();
    const now = audioContextInstance.currentTime;
    const notes = [
      { freq: 587.33, start: 0.00, dur: 0.10, gain: 0.13 }, // D5
      { freq: 440.00, start: 0.08, dur: 0.24, gain: 0.10 }, // A4
    ];
    notes.forEach(({ freq, start, dur, gain: noteGain }) => {
      if (!audioContextInstance) return;
      const osc = audioContextInstance.createOscillator();
      const gainNode = audioContextInstance.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gainNode.gain.setValueAtTime(0, now + start);
      gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gainNode);
      gainNode.connect(audioContextInstance.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch {
    // Ignored in restricted environments
  }
};

/* ─── Discord-style Chat Message Sound ─── */
const playChatMessageSound = (): void => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextInstance) audioContextInstance = new AudioContextClass();
    if (audioContextInstance.state === "suspended") void audioContextInstance.resume();
    const now = audioContextInstance.currentTime;
    const osc = audioContextInstance.createOscillator();
    const gainNode = audioContextInstance.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gainNode);
    gainNode.connect(audioContextInstance.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    // Ignored in restricted environments
  }
};



/* ─── Main Application Component ─── */
export const App = (): ReactElement => {
  const session = useSession();
  const { state } = session;
  const isConnected = state.phase === "connected";
  const localSharing = state.mediaPhase === "sharing" && !!session.localStream;
  const remotePhase = session.remoteMediaPhase ?? "stopped";
  const remoteSharing = remotePhase === "sharing" && !!session.remoteStream;

  type FocusedStream = "local" | "remote";
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [focused, setFocused] = useState<FocusedStream>(remoteSharing ? "remote" : "local");


  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streamMenuOpen, setStreamMenuOpen] = useState(false);
  const [qualitySubmenuOpen, setQualitySubmenuOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const streamMenuRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<number | null>(null);

  /* Zoom & Pan State (Discord-style screen zoom) */
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const didPanOrDragRef = useRef(false);
  const mouseDownTimeRef = useRef(0);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const [videoFit, setVideoFit] = useState<"contain" | "cover">("contain");
  const minimapRef = useRef<HTMLDivElement>(null);
  const isDraggingMinimapRef = useRef(false);




  /* Discord-style Context Menu State */
  type ContextMenuTarget = "local" | "remote";
  const [stageContextMenu, setStageContextMenu] = useState<{ x: number; y: number; target: ContextMenuTarget } | null>(null);
  const [contextQualityOpen, setContextQualityOpen] = useState(false);

  const [contextZoomOpen, setContextZoomOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  /* Draggable & Snappable PiP State */
  type PipCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
  const [pipCorner, setPipCorner] = useState<PipCorner>("bottom-right");
  const [pipDragPos, setPipDragPos] = useState<{ x: number; y: number } | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const isDraggingPipRef = useRef(false);
  const pipDragStartRef = useRef<{ mouseX: number; mouseY: number; startElemX: number; startElemY: number; moved: boolean } | null>(null);
  const [pipDismissed, setPipDismissed] = useState(false);
  const [watchingRemote, setWatchingRemote] = useState(true);

  const prevLocalSharingRef = useRef(localSharing);
  const prevRemoteSharingRef = useRef(remoteSharing);

  const handleStopWatching = (): void => {
    setWatchingRemote(false);
    playStreamStopSound();
  };

  const handleStartWatching = (): void => {
    setWatchingRemote(true);
    playStreamStartSound();
  };

  useEffect(() => {
    const handleFocus = (): void => setIsWindowFocused(true);
    const handleBlur = (): void => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const prevConnectedRef = useRef(isConnected);
  const prevChatCountRef = useRef(0);
  const isInitialMountRef = useRef(true);
  const [lastReadTimestamp, setLastReadTimestamp] = useState(0);

  const unreadChatCount = state.chatPanelOpen
    ? 0
    : state.chatMessages.filter((m) => m.timestamp > lastReadTimestamp).length;

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevConnectedRef.current = isConnected;
      return;
    }

    if (!prevConnectedRef.current && isConnected) {
      playUserJoinSound();
    } else if (prevConnectedRef.current && !isConnected) {
      playUserLeaveSound();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (prevChatCountRef.current > 0 && state.chatMessages.length > prevChatCountRef.current) {
      playChatMessageSound();
    }
    prevChatCountRef.current = state.chatMessages.length;
  }, [state.chatMessages.length]);


  const handleToggleChat = (): void => {
    if (!state.chatPanelOpen) {
      setLastReadTimestamp(Date.now());
    }
    session.toggleChatPanel();
  };

  useEffect(() => {
    if (!prevLocalSharingRef.current && localSharing) {
      playStreamStartSound();
    } else if (prevLocalSharingRef.current && !localSharing) {
      playStreamStopSound();
    }
    prevLocalSharingRef.current = localSharing;
  }, [localSharing]);

  useEffect(() => {
    if (!prevRemoteSharingRef.current && remoteSharing) {
      setWatchingRemote(true);
      playStreamStartSound();
    } else if (prevRemoteSharingRef.current && !remoteSharing) {
      playStreamStopSound();
    }
    prevRemoteSharingRef.current = remoteSharing;
  }, [remoteSharing]);

  type StageLayoutMode = "focus" | "grid";
  const [layoutMode, setLayoutMode] = useState<StageLayoutMode>("focus");

  const dualSharing = localSharing && remoteSharing && watchingRemote;
  const isGridActive = layoutMode === "grid" && dualSharing;

  const [prevDualSharing, setPrevDualSharing] = useState(dualSharing);
  if (prevDualSharing !== dualSharing) {
    setPrevDualSharing(dualSharing);
    if (!dualSharing) {
      setPipDismissed(false);
    }
  }

  // Discord-style optimization: when window loses focus, pause local rendering while keeping stream active
  const effectiveFocused: FocusedStream =
    focused === "remote" && (!remoteSharing || !watchingRemote) && localSharing
      ? "local"
      : focused === "local" && !localSharing && remoteSharing && watchingRemote
        ? "remote"
        : focused;

  const focusedIsLocal = effectiveFocused === "local";
  const focusedSharing = focusedIsLocal ? localSharing : (remoteSharing && watchingRemote);
  const focusedStream = focusedIsLocal ? session.localStream : (watchingRemote ? session.remoteStream : undefined);
  const isAutoHideActive = focusedSharing;
  const otherSharing = focusedIsLocal ? (remoteSharing && watchingRemote) : localSharing;
  const showPip = otherSharing && !isGridActive && !pipDismissed; // Render PiP preview in focus mode unless dismissed

  const showControls = useCallback((): void => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2500);
  }, []);

  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!isAutoHideActive) {
      setControlsVisible(true);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const isNearTop = e.clientY <= rect.top + 90;
    const isNearBottom = e.clientY >= rect.bottom - 140;
    const isNearBottomRight = e.clientX >= rect.right - 150 && e.clientY >= rect.bottom - 90;
    const isNearTopLeft = e.clientY <= rect.top + 80 && e.clientX <= rect.left + 380;
    const isNearTopRight = e.clientY <= rect.top + 80 && e.clientX >= rect.right - 380;

    if (isNearTop || isNearTopLeft || isNearTopRight || isNearBottom || isNearBottomRight || streamMenuOpen) {
      showControls();
    }
  };

  const handleStageMouseLeave = (): void => {
    if (isAutoHideActive && !streamMenuOpen) {
      setControlsVisible(false);
    }
  };

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) window.clearTimeout(hideControlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleFsChange = (): void => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const requestFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => undefined);
        }
        await window.sfscreen?.toggleFullscreen?.().catch(() => undefined);
      } else {
        setIsFullscreen(true);
        await window.sfscreen?.toggleFullscreen?.().catch(() => undefined);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  }, [isFullscreen]);

  const exitFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      if (isFullscreen) {
        await window.sfscreen?.toggleFullscreen?.().catch(() => undefined);
      }
    } catch {
      await window.sfscreen?.toggleFullscreen?.().catch(() => undefined);
    }
    setIsFullscreen(false);
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (isFullscreen || Boolean(document.fullscreenElement)) {
          e.preventDefault();
          void exitFullscreen();
        } else if (streamMenuOpen) {
          setStreamMenuOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        }
      } else if (e.key === "F11") {
        e.preventDefault();
        void requestFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, streamMenuOpen, settingsOpen, exitFullscreen, requestFullscreen]);




  useEffect(() => {
    if (state.chatPanelOpen) {
      chatMessagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [state.chatMessages, state.chatPanelOpen]);

  useEffect(() => {
    if (!streamMenuOpen) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (streamMenuRef.current && !streamMenuRef.current.contains(e.target as Node)) {
        setStreamMenuOpen(false);
        setQualitySubmenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [streamMenuOpen]);

  const startSidebarResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMouseMove = (moveEvent: MouseEvent): void => {
      const next = Math.max(170, Math.min(420, startW + (moveEvent.clientX - startX)));
      setSidebarWidth(next);
    };
    const onMouseUp = (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startChatResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatWidth;
    const onMouseMove = (moveEvent: MouseEvent): void => {
      const next = Math.max(220, Math.min(600, startW - (moveEvent.clientX - startX)));
      setChatWidth(next);
    };
    const onMouseUp = (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const presenterName = focusedIsLocal

    ? state.localUserName
    : (state.remoteUserName || "Outra pessoa");

  const handleMinimizeWindow = (): void => { void window.sfscreen.minimizeWindow?.(); };
  const handleMaximizeWindow = (): void => { void window.sfscreen.maximizeWindow?.(); };
  const handleCloseWindow = (): void => { void window.sfscreen.closeWindow?.(); };

  const swapFocus = (): void => {
    if (!otherSharing) return;
    setFocused(focusedIsLocal ? "remote" : "local");
  };

  useEffect(() => {
    if (!stageContextMenu) return;
    const handleCloseContext = (e: MouseEvent): void => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setStageContextMenu(null);
        setContextQualityOpen(false);
        setContextZoomOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setStageContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleCloseContext);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleCloseContext);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [stageContextMenu]);

  const handleVideoMouseDown = (e: React.MouseEvent): void => {
    mouseDownTimeRef.current = Date.now();
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    didPanOrDragRef.current = false;
    if (zoomLevel <= 1) return;
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: panOffset.x,
      startY: panOffset.y,
    };
  };

  const handleVideoMouseMove = (e: React.MouseEvent): void => {
    if (mouseDownPosRef.current) {
      const dist = Math.hypot(e.clientX - mouseDownPosRef.current.x, e.clientY - mouseDownPosRef.current.y);
      if (dist > 4) {
        didPanOrDragRef.current = true;
      }
    }
    if (!isPanning || !panStartRef.current || zoomLevel <= 1) return;
    const dx = e.clientX - panStartRef.current.mouseX;
    const dy = e.clientY - panStartRef.current.mouseY;
    const maxPan = (zoomLevel - 1) * 350;
    setPanOffset({
      x: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.startX + dx)),
      y: Math.max(-maxPan, Math.min(maxPan, panStartRef.current.startY + dy)),
    });
  };

  const handleVideoMouseUp = (): void => {
    if (Date.now() - mouseDownTimeRef.current > 200) {
      didPanOrDragRef.current = true;
    }
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleVideoWheel = (e: React.WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomLevel((prev) => {
        const next = Math.max(1, Math.min(3, Math.round((prev + delta) * 100) / 100));
        if (next === 1) setPanOffset({ x: 0, y: 0 });
        return next;
      });
    }
  };

  const handleVideoDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (zoomLevel === 1) {
      setZoomLevel(1.5);
    } else {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  const handleStageVideoClick = (e: React.MouseEvent): void => {
    // Proteção: Se estiver com zoom ativo, se clicou e segurou, ou se arrastou a tela, NÃO ir para o modo grade
    if (zoomLevel > 1 || didPanOrDragRef.current || isPanning) {
      return;
    }
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".stage-top-pill") ||
      target.closest(".stage-top-right-pill") ||
      target.closest(".stage-corner-controls") ||
      target.closest(".stage-zoom-navigator-card") ||
      target.closest(".stage-pip-card") ||
      target.closest(".discord-context-menu")
    ) {
      return;
    }
    if (dualSharing && zoomLevel === 1) {
      setLayoutMode("grid");
    }
  };



  const resetZoom = (): void => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const updatePanFromMinimap = (clientX: number, clientY: number): void => {
    const minimap = minimapRef.current;
    if (!minimap) return;
    const rect = minimap.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const curBoxW = Math.max(24, 180 / zoomLevel);
    const curBoxH = Math.max(16, 101 / zoomLevel);
    const availW = Math.max(1, 180 - curBoxW);
    const availH = Math.max(1, 101 - curBoxH);

    const targetBoxX = Math.max(0, Math.min(availW, clickX - curBoxW / 2));
    const targetBoxY = Math.max(0, Math.min(availH, clickY - curBoxH / 2));

    const ratioX = (targetBoxX - availW / 2) / (availW / 2 || 1);
    const ratioY = (targetBoxY - availH / 2) / (availH / 2 || 1);

    const curMaxPan = (zoomLevel - 1) * 350;
    setPanOffset({
      x: -ratioX * curMaxPan,
      y: -ratioY * curMaxPan,
    });
  };

  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    isDraggingMinimapRef.current = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
    updatePanFromMinimap(e.clientX, e.clientY);
  };

  const handleMinimapPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!isDraggingMinimapRef.current) return;
    updatePanFromMinimap(e.clientX, e.clientY);
  };

  const handleMinimapPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    isDraggingMinimapRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };


  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    const stageEl = stageRef.current;
    const pipEl = pipRef.current;
    if (!stageEl || !pipEl) return;

    const stageRect = stageEl.getBoundingClientRect();
    const pipRect = pipEl.getBoundingClientRect();

    pipDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startElemX: pipRect.left - stageRect.left,
      startElemY: pipRect.top - stageRect.top,
      moved: false,
    };
    isDraggingPipRef.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!pipDragStartRef.current || !stageRef.current) return;
    const dx = e.clientX - pipDragStartRef.current.mouseX;
    const dy = e.clientY - pipDragStartRef.current.mouseY;
    if (!pipDragStartRef.current.moved && Math.hypot(dx, dy) > 5) {
      pipDragStartRef.current.moved = true;
      isDraggingPipRef.current = true;
    }
    if (isDraggingPipRef.current) {
      const stageRect = stageRef.current.getBoundingClientRect();
      const pipW = 210;
      const pipH = 132;
      const curX = Math.max(8, Math.min(stageRect.width - pipW - 8, pipDragStartRef.current.startElemX + dx));
      const curY = Math.max(8, Math.min(stageRect.height - pipH - 8, pipDragStartRef.current.startElemY + dy));
      setPipDragPos({ x: curX, y: curY });
    }
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!pipDragStartRef.current) return;
    const wasMoved = pipDragStartRef.current.moved;
    pipDragStartRef.current = null;
    isDraggingPipRef.current = false;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    if (!wasMoved) {
      swapFocus();
      return;
    }

    if (pipDragPos && stageRef.current) {
      const stageRect = stageRef.current.getBoundingClientRect();
      const centerX = pipDragPos.x + 105;
      const centerY = pipDragPos.y + 66;

      const isLeft = centerX < stageRect.width / 2;
      const isTop = centerY < stageRect.height / 2;

      const corner: PipCorner =
        isTop && isLeft
          ? "top-left"
          : isTop && !isLeft
            ? "top-right"
            : !isTop && isLeft
              ? "bottom-left"
              : "bottom-right";

      setPipCorner(corner);
      setPipDragPos(null);
    }
  };


  const handleSendChat = (e: FormEvent): void => {
    e.preventDefault();
    if (chatText.trim()) {
      session.sendChatMessage(chatText);
      setChatText("");
    }
  };

  const participantsCount = isConnected ? 2 : 1;

  return (
    <div className={`discord-app-layout ${isFullscreen ? "is-app-fullscreen" : ""}`}>

      {/* Integrated Titlebar & Top Header */}
      <header className="discord-topbar window-drag-region" onDoubleClick={handleMaximizeWindow}>

        <div className="topbar-left window-no-drag">
          <button
            className={`icon-action-button sidebar-toggle-btn ${sidebarOpen ? "is-active" : ""}`}
            type="button"
            title={sidebarOpen ? "Recolher barra lateral" : "Expandir barra lateral"}
            aria-label={sidebarOpen ? "Recolher barra lateral" : "Expandir barra lateral"}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <SidebarIcon />
          </button>

          <div className="brand-badge">
            <span className="brand-mark-clean"><BrandIcon /></span>
            <span className="brand-text">SFScreen</span>
          </div>

          <div className="session-title-pill">
            <span className="session-name">
              {isConnected ? `Sessão com ${state.remoteUserName}` : "Sua Sala Privada"}
            </span>
            <span className="participant-counter" title={`${participantsCount} participante(s)`}>
              <UsersIcon /> {participantsCount}
            </span>
          </div>
        </div>

        <div className="topbar-center window-no-drag">
          <div
            className="status-pill status-connection"
            title={`Status da rede Tailscale: ${state.tailscale.peers?.length || 0} peer(s) na tailnet (${(state.tailscale.peers || []).filter((p) => p.online).length} online)`}
          >
            <SignalWifiIcon />
            <span>
              {state.tailscale.state === "ready"
                ? `Conexão excelente · 18 ms · ${state.tailscale.peers?.length || 0} peer${(state.tailscale.peers?.length || 0) !== 1 ? "s" : ""}`
                : "Tailscale conectando…"}
            </span>
          </div>

          <div className="status-pill status-security" title="Criptografia ativa">
            <LockShieldIcon />
            <span>DTLS-SRTP ativo</span>
          </div>
        </div>


        <div className="topbar-right window-no-drag">
          <button className="icon-action-button" type="button" title="Configurações" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
          </button>
          <button className="user-avatar-button" type="button" title={`Perfil: ${state.localUserName}`} onClick={() => setSettingsOpen(true)}>
            <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="topbar-avatar-inner" />
          </button>

          {/* Window Native Controls */}
          <div className="window-controls-group">
            <button className="window-control-btn" type="button" title="Minimizar" onClick={handleMinimizeWindow}>
              <WindowMinimizeIcon />
            </button>
            <button className="window-control-btn" type="button" title="Maximizar / Restaurar" onClick={handleMaximizeWindow}>
              <WindowMaximizeIcon />
            </button>
            <button className="window-control-btn is-close" type="button" title="Fechar" onClick={handleCloseWindow}>
              <WindowCloseIcon />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body: Sidebar + Stage + Chat (Flex Resizable Layout) */}
      <div className={`discord-body ${sidebarOpen ? "" : "is-sidebar-collapsed"}`}>
        {/* Left Sidebar (Collapsible & Resizable) */}
        {sidebarOpen && (
          <aside className="discord-sidebar" style={{ width: `${sidebarWidth}px` }}>
            <div className="sidebar-header-row">
              <div className="section-title">Participantes ({participantsCount})</div>
              <button
                className="icon-action-button sidebar-collapse-btn"
                type="button"
                title="Recolher barra lateral"
                aria-label="Recolher barra lateral"
                onClick={() => setSidebarOpen(false)}
              >
                <XCloseIcon />
              </button>
            </div>
            <div className="participant-list">
              {isConnected && (
                <div className="participant-item">
                  <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="user-avatar-small" />
                  <div className="participant-info">
                    <span className="name-row">
                      <strong>{state.remoteUserName}</strong>
                      {state.role === "viewer" && <span className="crown-icon" title="Host da sessão"><CrownIcon /></span>}
                    </span>
                    <small className="participant-status-row">
                      {remoteSharing ? (
                        watchingRemote ? (
                          <span className="live-status-pill"><ScreenCastIcon /> Transmitindo</span>
                        ) : (
                          <span className="sidebar-stream-cta-row">
                            <span className="live-status-pill"><ScreenCastIcon /> Transmitindo</span>
                            <button
                              className="sidebar-watch-btn"
                              type="button"
                              onClick={handleStartWatching}
                            >
                              Ver tela
                            </button>
                          </span>
                        )
                      ) : (
                        "Conectado"
                      )}
                    </small>

                  </div>
                </div>
              )}

              <div className="participant-item">
                <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="user-avatar-small is-self" />
                <div className="participant-info">
                  <span className="name-row">
                    <strong>{state.localUserName}</strong>
                    {state.role === "host" && <span className="crown-icon" title="Host da sessão"><CrownIcon /></span>}
                  </span>
                  <small>{localSharing ? "Transmitindo tela" : isConnected ? "Conectado" : "Na sala"}</small>
                </div>
              </div>
            </div>


            <div className="sidebar-footer">
              <button className="button primary invite-btn" type="button" onClick={() => session.toggleSessionModal(true)}>
                + Convidar pessoa
              </button>
            </div>




            {/* Sidebar Resize Handle */}
            <div
              className="resize-handle resize-handle-right"
              onMouseDown={startSidebarResize}
              title="Arraste para redimensionar barra lateral"
            />
          </aside>
        )}

        {/* Main Stage (Clean Video Area with Floating Overlay Dock) */}
        <main
          className="discord-stage-area"
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          onContextMenu={(e) => {
            e.preventDefault();
            setStageContextMenu({ x: e.clientX, y: e.clientY, target: focusedIsLocal ? "local" : "remote" });
          }}
        >
          <div ref={stageRef} className={`main-stage-box ${focusedSharing ? "is-active-stream" : "is-idle-stream"} ${isGridActive ? "is-grid-layout" : ""}`}>
            {isGridActive ? (
              <div className="main-stage-grid">
                <div className={`stage-top-right-pill stage-fade-element ${controlsVisible || streamMenuOpen ? "is-visible" : ""}`}>
                  <div
                    className="stream-viewers-tag"
                    title="2 participantes na chamada"
                  >
                    <EyeIcon />
                    <span className="viewers-count">2</span>
                    <span className="viewers-name">Ao vivo</span>
                  </div>
                  <button
                    className="stage-layout-mode-btn is-active"
                    type="button"
                    onClick={() => setLayoutMode("focus")}
                    title="Alternar para Modo Foco"
                  >
                    <FocusViewIcon />
                    <span>Modo Foco</span>
                  </button>
                </div>

                {/* Tile 1: Local Stream */}
                <div
                  className={`stage-grid-tile ${focusedIsLocal ? "is-focused-tile" : ""}`}
                  onClick={() => {
                    setFocused("local");
                    setLayoutMode("focus");
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStageContextMenu({ x: e.clientX, y: e.clientY, target: "local" });
                  }}
                  role="button"
                  tabIndex={0}
                  title="Clique para focar nesta tela"
                >
                  <div className="grid-tile-ambient-bg" />

                  {state.mediaPhase === "sharing" && session.localStream ? (
                    <div className="grid-tile-split-content">
                      {/* Participant Card on the Left with Ambient Backdrop */}
                      <div className="tile-side-avatar-box is-self">
                        <div className={`card-ambient-backdrop ${!state.localUserAvatar ? "is-fallback" : ""}`}>
                          {state.localUserAvatar && (
                            <img src={state.localUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                          )}
                        </div>

                        <div className="card-inner-header">
                          <div className="card-header-pills">
                            <span className="tile-res-pill">{session.resolution} · {session.fps} FPS</span>
                            <span className="tile-icon-badge" title="Microfone ativo"><MicMutedIcon /></span>
                            <span className={`tile-icon-badge ${!state.includeSystemAudio ? "is-muted" : ""}`} title="Áudio da Transmissão">
                              {state.includeSystemAudio ? <SpeakerOnIcon /> : <SpeakerMuteIcon />}
                            </span>
                            <span className="tile-icon-badge is-active" title="Transmissão de tela"><ScreenCastIcon /></span>
                          </div>
                          <div className="tile-live-badge">
                            <span className="tile-live-dot" />
                            <span>AO VIVO</span>
                          </div>
                        </div>

                        <div className="card-inner-body">
                          <div className="tile-side-avatar-ring is-self">
                            <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="tile-side-avatar-inner is-self" />
                          </div>
                          <span className="tile-side-name">{state.localUserName}</span>
                          <span className="tile-side-subtitle">Compartilhando a tela</span>
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill" title="Latência da conexão">
                            <SignalBarsIcon />
                            <span>Conexão estável · 18 ms</span>
                            <InfoCircleIcon />
                          </div>
                          <div className="tile-footer-pill is-camera" title="Dispositivo de vídeo pronto">
                            <CameraIcon />
                            <span>Câmera</span>
                            <span className="camera-status-dot" />
                          </div>
                        </div>
                      </div>

                      {/* Screenshare Video on the Right with Ambient Blurred Backdrop */}
                      <div className="tile-screenshare-box">
                        {!isWindowFocused ? (
                          <div className="grid-tile-paused-state">
                            <EcoZapIcon />
                            <p>Sua transmissão está ligada, porém pausamos a renderização para reduzir consumos.</p>
                          </div>
                        ) : (
                          <>
                            <div className="screenshare-ambient-backdrop">
                              <Video stream={session.localStream} muted volume={0} className="screenshare-ambient-video" />
                            </div>
                            <Video stream={session.localStream} muted volume={0} className="stage-video is-contain" />
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid-tile-nonsharing-content">
                      <div className={`card-ambient-backdrop ${!state.localUserAvatar ? "is-fallback" : ""}`}>
                        {state.localUserAvatar && (
                          <img src={state.localUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                        )}
                      </div>

                      <div className="card-inner-header">
                        <div className="card-header-pills">
                          <span className="tile-icon-badge" title="Microfone ativo"><MicMutedIcon /></span>
                          <span className={`tile-icon-badge ${!state.includeSystemAudio ? "is-muted" : ""}`} title="Áudio da Transmissão">
                            {state.includeSystemAudio ? <SpeakerOnIcon /> : <SpeakerMuteIcon />}
                          </span>
                          <span className="tile-icon-badge is-muted" title="Sem transmissão de tela"><ScreenCastIcon /></span>
                        </div>
                      </div>

                      <div className="tile-center-profile-box">
                        <div className="tile-avatar-ring is-self">
                          <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="tile-avatar-inner is-self" />
                        </div>
                        <span className="tile-avatar-name">{state.localUserName}</span>
                      </div>

                      <div className="card-inner-footer">
                        <div className="tile-footer-pill" title="Latência da conexão">
                          <SignalBarsIcon />
                          <span>Conexão estável · 18 ms</span>
                          <InfoCircleIcon />
                        </div>
                        <div className="tile-footer-pill is-camera" title="Dispositivo de vídeo pronto">
                          <CameraIcon />
                          <span>Câmera</span>
                          <span className="camera-status-dot" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid-tile-overlay-hint">
                    <FocusViewIcon />
                    <span>Clique para focar</span>
                  </div>
                </div>

                {/* Tile 2: Remote Stream */}
                <div
                  className={`stage-grid-tile ${!focusedIsLocal ? "is-focused-tile" : ""}`}
                  onClick={() => {
                    setFocused("remote");
                    setLayoutMode("focus");
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStageContextMenu({ x: e.clientX, y: e.clientY, target: "remote" });
                  }}
                  role="button"
                  tabIndex={0}
                  title="Clique para focar nesta tela"
                >
                  <div className="grid-tile-ambient-bg" />

                  {session.remoteStream ? (
                    <div className="grid-tile-split-content">
                      {/* Participant Card on the Left with Ambient Backdrop */}
                      <div className="tile-side-avatar-box">
                        <div className={`card-ambient-backdrop ${!state.remoteUserAvatar ? "is-fallback" : ""}`}>
                          {state.remoteUserAvatar && (
                            <img src={state.remoteUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                          )}
                        </div>

                        <div className="card-inner-header">
                          <div className="card-header-pills">
                            <span className="tile-res-pill">1080p · 60 FPS</span>
                            <span className="tile-icon-badge" title="Microfone"><MicMutedIcon /></span>
                            <button
                              className={`tile-icon-badge is-btn ${remoteMuted ? "is-muted" : "is-active"}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRemoteMuted((v) => !v);
                              }}
                              title={remoteMuted ? `Ativar som de ${state.remoteUserName}` : `Silenciar áudio de ${state.remoteUserName}`}
                            >
                              {remoteMuted ? <SpeakerMuteIcon /> : <SpeakerOnIcon />}
                            </button>
                            <span className="tile-icon-badge is-active" title="Transmissão"><ScreenCastIcon /></span>
                          </div>
                          <div className="tile-live-badge">
                            <span className="tile-live-dot" />
                            <span>AO VIVO</span>
                          </div>
                        </div>

                        <div className="card-inner-body">
                          <div className="tile-side-avatar-ring">
                            <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="tile-side-avatar-inner" />
                          </div>
                          <span className="tile-side-name">{state.remoteUserName}</span>
                          <span className="tile-side-subtitle">Compartilhando a tela</span>
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill" title="Latência da conexão">
                            <SignalBarsIcon />
                            <span>Conexão estável · 18 ms</span>
                            <InfoCircleIcon />
                          </div>
                          <div className="tile-footer-pill is-camera" title="Dispositivo de vídeo">
                            <CameraIcon />
                            <span>{state.remoteUserName}</span>
                            <span className="camera-status-dot" />
                          </div>
                        </div>
                      </div>

                      {/* Screenshare Video on the Right with Ambient Blurred Backdrop */}
                      <div className="tile-screenshare-box">
                        <div className="screenshare-ambient-backdrop">
                          <Video stream={session.remoteStream} muted volume={0} className="screenshare-ambient-video" />
                        </div>
                        <Video
                          stream={session.remoteStream}
                          muted={remoteMuted}
                          volume={remoteVolume}
                          className="stage-video is-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid-tile-nonsharing-content">
                      <div className={`card-ambient-backdrop ${!state.remoteUserAvatar ? "is-fallback" : ""}`}>
                        {state.remoteUserAvatar && (
                          <img src={state.remoteUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                        )}
                      </div>

                      <div className="card-inner-header">
                        <div className="card-header-pills">
                          <span className="tile-icon-badge" title="Microfone"><MicMutedIcon /></span>
                          <button
                            className={`tile-icon-badge is-btn ${remoteMuted ? "is-muted" : "is-active"}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemoteMuted((v) => !v);
                            }}
                            title={remoteMuted ? `Ativar som de ${state.remoteUserName}` : `Silenciar áudio de ${state.remoteUserName}`}
                          >
                            {remoteMuted ? <SpeakerMuteIcon /> : <SpeakerOnIcon />}
                          </button>
                          <span className="tile-icon-badge is-muted" title="Sem transmissão"><ScreenCastIcon /></span>
                        </div>
                      </div>

                      <div className="tile-center-profile-box">
                        <div className="tile-avatar-ring">
                          <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="tile-avatar-inner" />
                        </div>
                        <span className="tile-avatar-name">{state.remoteUserName}</span>
                      </div>

                      <div className="card-inner-footer">
                        <div className="tile-footer-pill" title="Latência da conexão">
                          <SignalBarsIcon />
                          <span>Conexão estável · 18 ms</span>
                          <InfoCircleIcon />
                        </div>
                        <div className="tile-footer-pill is-camera" title="Dispositivo de vídeo">
                          <CameraIcon />
                          <span>{state.remoteUserName}</span>
                          <span className="camera-status-dot" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid-tile-overlay-hint">
                    <FocusViewIcon />
                    <span>Clique para focar</span>
                  </div>
                </div>
              </div>

            ) : focusedSharing && focusedStream ? (
              <div
                className="stage-video-viewport"
                onClick={handleStageVideoClick}
                onMouseDown={handleVideoMouseDown}
                onMouseMove={handleVideoMouseMove}
                onMouseUp={handleVideoMouseUp}
                onWheel={handleVideoWheel}
                onDoubleClick={handleVideoDoubleClick}
                title={dualSharing && zoomLevel === 1 ? "Clique na tela para alternar para o Modo Grade" : undefined}
                style={{
                  cursor: isPanning ? "grabbing" : zoomLevel > 1 ? "grab" : dualSharing ? "pointer" : "default",
                }}
              >

                <div className={`stage-top-pill stage-fade-element ${controlsVisible || streamMenuOpen ? "is-visible" : ""}`}>
                  <span className="presenter-tag"><ScreenCastIcon /> {presenterName} está apresentando</span>
                  <span className="resolution-tag">{focusedIsLocal ? `${session.resolution} · ${session.fps} FPS` : "1080p · 60 FPS"}</span>
                </div>


                <div className={`stage-top-right-pill stage-fade-element ${controlsVisible || streamMenuOpen ? "is-visible" : ""}`}>
                  <div
                    className="stream-viewers-tag"
                    title={focusedIsLocal ? `Espectador: ${state.remoteUserName || "Outra pessoa"}` : "Você está assistindo"}
                  >
                    <EyeIcon />
                    <span className="viewers-count">1</span>
                    <UserAvatar
                      name={focusedIsLocal ? (state.remoteUserName || "O") : (state.localUserName || "V")}
                      avatar={focusedIsLocal ? state.remoteUserAvatar : state.localUserAvatar}
                      isSelf={!focusedIsLocal}
                      className="viewer-mini-avatar"
                    />
                  </div>



                  {dualSharing && (
                    <button
                      className="stage-layout-mode-btn"
                      type="button"
                      onClick={() => setLayoutMode("grid")}
                      title="Alternar para Modo Grade"
                    >
                      <GridViewIcon />
                      <span>Modo Grade</span>
                    </button>
                  )}


                  {!focusedIsLocal && (
                    <button
                      className="stop-watching-btn"
                      type="button"
                      onClick={handleStopWatching}
                      title="Parar de ver a tela"
                    >
                      <XCloseIcon />
                      <span>Parar de ver</span>
                    </button>
                  )}
                </div>

                {focusedIsLocal && !isWindowFocused ? (
                  <div className="stage-paused-render-state">
                    <div className="paused-render-icon">
                      <EcoZapIcon />
                    </div>
                    <div className="paused-render-live-pill">
                      <span className="live-dot" />
                      <span>Sua transmissão está ligada</span>
                    </div>
                    <h2>Pausamos a renderização para reduzir consumos</h2>
                    <p>Enquanto o SFScreen estiver fora de foco, a exibição do vídeo local fica em repouso para economizar bateria e memória RAM. Sua transmissão continua ativa para os outros participantes.</p>
                  </div>
                ) : (
                  <div
                    className="stage-video-transform-layer"
                    style={{
                      transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                      transition: isPanning ? "none" : "transform 0.15s ease-out",
                    }}
                  >
                    <Video
                      stream={focusedStream}
                      muted={focusedIsLocal || remoteMuted}
                      volume={focusedIsLocal ? 0 : remoteVolume}
                      className={`stage-video ${videoFit === "cover" ? "is-cover" : "is-contain"}`}
                    />
                  </div>
                )}
              </div>

            ) : !focusedIsLocal && remoteSharing && !watchingRemote ? (
              <div className="stage-empty-state is-stream-available">
                <div className="empty-avatar-icon is-live"><ScreenCastIcon /></div>
                <h2>{state.remoteUserName} está transmitindo</h2>
                <p>A transmissão ao vivo está ativa na chamada. Clique abaixo para assistir.</p>
                <button
                  className="button primary watch-stream-hero-btn"
                  type="button"
                  onClick={handleStartWatching}
                >
                  <ScreenCastIcon />
                  <span>Ver tela</span>
                </button>
              </div>
            ) : (
              <div className={`stage-call-participants-view ${isConnected ? "has-two-peers" : "is-single-peer"}`}>
                {/* Local Participant Card */}
                <div className="call-participant-card is-self-card">
                  <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="call-card-avatar is-self" />
                  <div className="call-card-name-tag">
                    <span className="name-text">{state.localUserName} (Você)</span>
                    {state.role === "host" && <span className="crown-icon" title="Host da sessão"><CrownIcon /></span>}
                  </div>
                </div>

                {/* Remote Participant Card (when connected) */}
                {isConnected && (
                  <div className="call-participant-card">
                    <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="call-card-avatar" />
                    <div className="call-card-name-tag">
                      <span className="name-text">{state.remoteUserName}</span>
                      {state.role === "viewer" && <span className="crown-icon" title="Host da sessão"><CrownIcon /></span>}
                    </div>
                  </div>
                )}
              </div>

            )}




            {/* Discord-style Zoom Navigator & Mini-map Viewfinder Widget */}
            {focusedSharing && zoomLevel > 1 && (
              <div className="stage-zoom-navigator-card">
                {/* Live Screen Preview Mini-map with draggable blue viewfinder box */}
                <div
                  ref={minimapRef}
                  className="zoom-minimap-preview"
                  onPointerDown={handleMinimapPointerDown}
                  onPointerMove={handleMinimapPointerMove}
                  onPointerUp={handleMinimapPointerUp}
                  title="Arraste a caixa azul ou clique para mover o zoom de lugar"
                >
                  {focusedStream && (
                    <Video
                      stream={focusedStream}
                      muted
                      volume={0}
                      className="zoom-minimap-video"
                    />
                  )}
                  {/* Draggable Blue Viewfinder Box */}
                  <div
                    className="zoom-viewfinder-box"
                    style={{
                      width: `${Math.max(24, 180 / zoomLevel)}px`,
                      height: `${Math.max(16, 101 / zoomLevel)}px`,
                      left: `${((180 - Math.max(24, 180 / zoomLevel)) / 2) - ((zoomLevel > 1 && (zoomLevel - 1) * 350 > 0 ? Math.max(-1, Math.min(1, panOffset.x / ((zoomLevel - 1) * 350))) : 0) * ((180 - Math.max(24, 180 / zoomLevel)) / 2))}px`,
                      top: `${((101 - Math.max(16, 101 / zoomLevel)) / 2) - ((zoomLevel > 1 && (zoomLevel - 1) * 350 > 0 ? Math.max(-1, Math.min(1, panOffset.y / ((zoomLevel - 1) * 350))) : 0) * ((101 - Math.max(16, 101 / zoomLevel)) / 2))}px`,
                    }}
                  />
                </div>

                {/* Slider Controls Bar (Discord style) */}
                <div className="zoom-slider-bar">
                  <button
                    className="zoom-icon-btn"
                    type="button"
                    title="Diminuir zoom"
                    onClick={() => {
                      const next = Math.max(1, Math.round((zoomLevel - 0.25) * 100) / 100);
                      setZoomLevel(next);
                      if (next === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                  >
                    <ZoomOutIcon />
                  </button>

                  <input
                    type="range"
                    className="zoom-range-input"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoomLevel}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setZoomLevel(next);
                      if (next === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    title={`Zoom: ${Math.round(zoomLevel * 100)}%`}
                  />

                  <button
                    className="zoom-icon-btn"
                    type="button"
                    title="Aumentar zoom"
                    onClick={() => setZoomLevel((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                  >
                    <ZoomInIcon />
                  </button>

                  <button
                    className="zoom-reset-badge"
                    type="button"
                    title="Redefinir zoom (100%)"
                    onClick={resetZoom}
                  >
                    {Math.round(zoomLevel * 100)}% ✕
                  </button>
                </div>
              </div>
            )}


            {/* Stage Bottom-Right Corner Controls (Discord Style) */}
            <div className={`stage-corner-controls stage-fade-element ${!isAutoHideActive || controlsVisible || streamMenuOpen ? "is-visible" : ""}`}>
              {/* Speaker with hover volume slider (apenas na tela de outro participante) */}
              {(!focusedIsLocal || isGridActive) && remoteSharing && watchingRemote && (
                <div className="corner-volume-wrap">

                  <button
                    className={`stage-corner-btn ${remoteMuted ? "is-muted" : "is-active"}`}
                    type="button"
                    title={remoteMuted ? "Ativar som" : "Silenciar áudio"}
                    onClick={() => setRemoteMuted((v) => !v)}
                  >
                    {remoteMuted ? <SpeakerMuteIcon /> : <SpeakerOnIcon />}
                  </button>
                  <div className="corner-volume-slider-bar">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      value={remoteMuted ? 0 : remoteVolume}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRemoteVolume(val);
                        if (val > 0 && remoteMuted) setRemoteMuted(false);
                        if (val === 0 && !remoteMuted) setRemoteMuted(true);
                      }}
                      title={`Volume: ${Math.round((remoteMuted ? 0 : remoteVolume) * 100)}%`}
                    />
                  </div>
                </div>
              )}


              {dualSharing && (
                <button
                  className={`stage-corner-btn ${isGridActive ? "is-active" : ""}`}
                  type="button"
                  title={isGridActive ? "Alternar para Modo Foco" : "Alternar para Modo Grade (Lado a Lado)"}
                  onClick={() => setLayoutMode((m) => (m === "grid" ? "focus" : "grid"))}
                >
                  {isGridActive ? <FocusViewIcon /> : <GridViewIcon />}
                </button>
              )}

              <button
                className="stage-corner-btn"
                type="button"
                title="Tela cheia"
                onClick={requestFullscreen}
              >
                <FullscreenIcon />
              </button>
            </div>


            {/* PiP Thumbnail if both are active (Draggable with 4-corner snap) */}
            {showPip && (
              <div
                ref={pipRef}
                className={`stage-pip-card corner-${pipCorner} ${pipDragPos ? "is-dragging" : ""}`}
                onPointerDown={handlePipPointerDown}
                onPointerMove={handlePipPointerMove}
                onPointerUp={handlePipPointerUp}
                style={
                  pipDragPos
                    ? {
                        left: `${pipDragPos.x}px`,
                        top: `${pipDragPos.y}px`,
                        right: "auto",
                        bottom: "auto",
                        transition: "none",
                        cursor: "grabbing",
                      }
                    : undefined
                }
                role="button"
                tabIndex={0}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setStageContextMenu({ x: e.clientX, y: e.clientY, target: focusedIsLocal ? "remote" : "local" });
                }}
                title="Arraste para qualquer um dos 4 cantos ou clique para alternar o foco"
              >
                {/* Close / Dismiss Button */}
                <button
                  className="pip-close-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPipDismissed(true);
                  }}
                  title="Fechar miniatura flutuante"
                  aria-label="Fechar miniatura"
                >
                  <XCloseIcon />
                </button>

                <div className="pip-video-wrapper">
                  {!focusedIsLocal && !isWindowFocused ? (
                    <div className="pip-paused-state">
                      <EcoZapIcon />
                      <small>Sua transmissão está ligada, porém pausamos a renderização para reduzir consumos.</small>
                    </div>
                  ) : (
                    <Video
                      stream={focusedIsLocal ? session.remoteStream : session.localStream}
                      muted={!focusedIsLocal || remoteMuted}
                      volume={!focusedIsLocal ? 0 : remoteVolume}
                      className="pip-video"
                    />
                  )}
                </div>

                <div className="pip-footer">
                  <div className="pip-footer-title">
                    <MoveIcon />
                    <span>{focusedIsLocal ? state.remoteUserName : "Você"}</span>
                  </div>
                  <span className="live-badge">AO VIVO</span>
                </div>
              </div>
            )}



            {/* Bottom Hover Proximity Trigger Zone */}
            <div className="stage-dock-trigger-zone" onMouseEnter={showControls} onMouseMove={showControls} />

            {/* Floating In-Stage Control Dock (Discord Style) */}
            <div
              className={`stage-floating-dock stage-fade-element ${!isAutoHideActive || controlsVisible || streamMenuOpen ? "is-visible" : ""}`}
              onMouseEnter={showControls}
            >
              {/* Screen Share Button & Discord Popover Menu */}
              {localSharing ? (

                <div className="dock-stream-wrapper" ref={streamMenuRef}>
                  {streamMenuOpen && (
                    <div className="stream-popover-menu" role="menu">
                      {/* Parar de transmitir */}
                      <button
                        className="stream-menu-item is-danger"
                        type="button"
                        onClick={() => {
                          void session.stopSharing();
                          setStreamMenuOpen(false);
                        }}
                      >
                        <ScreenOffIcon />
                        <span>Parar de transmitir</span>
                      </button>

                      {/* Alterar a Transmissão */}
                      <button
                        className="stream-menu-item"
                        type="button"
                        onClick={() => {
                          void session.openSourcePicker();
                          setStreamMenuOpen(false);
                        }}
                      >
                        <ScreenSwitchIcon />
                        <span>Alterar a Transmissão</span>
                      </button>

                      {/* Qualidade da transmissão */}
                      <div className="stream-menu-quality-section">
                        <button
                          className="stream-menu-item with-chevron"
                          type="button"
                          onClick={() => setQualitySubmenuOpen((v) => !v)}
                        >
                          <SlidersIcon />
                          <span>Qualidade da transmissão</span>
                          <span className={`menu-chevron ${qualitySubmenuOpen ? "is-open" : ""}`}><ChevronRightIcon /></span>
                        </button>

                        {qualitySubmenuOpen && (
                          <div className="quality-options-box">
                            <div className="quality-subgroup">
                              <span className="quality-subgroup-title">Resolução</span>
                              <div className="quality-pill-row">
                                {(['720p', '1080p', '1440p'] as const).map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    className={`quality-opt-pill ${session.resolution === r ? "is-selected" : ""}`}
                                    onClick={() => session.setResolution(r)}
                                  >
                                    {r}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="quality-subgroup">
                              <span className="quality-subgroup-title">Taxa de quadros</span>
                              <div className="quality-pill-row">
                                {([30, 60] as const).map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    className={`quality-opt-pill ${session.fps === f ? "is-selected" : ""}`}
                                    onClick={() => session.setFps(f)}
                                  >
                                    {f} FPS
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Compartilhar áudio da transmissão com Switch Toggle */}
                      <label className="stream-menu-item is-switch-item" onClick={(e) => e.stopPropagation()}>
                        <div className="stream-switch-label-row">
                          <SpeakerOnIcon />
                          <span>Compartilhar áudio da transmissão</span>
                        </div>
                        <div className="switch-toggle-wrapper is-mini">
                          <input
                            type="checkbox"
                            className="switch-toggle-input"
                            checked={state.includeSystemAudio}
                            onChange={() => void session.toggleSystemAudio()}
                            aria-label="Compartilhar áudio da transmissão"
                          />
                          <div className={`switch-toggle-track ${state.includeSystemAudio ? "is-checked" : ""}`}>
                            <div className="switch-toggle-thumb" />
                          </div>
                        </div>
                      </label>


                      <div className="stream-menu-divider" />

                      {/* Relatar um problema */}
                      <button
                        className="stream-menu-item is-muted"
                        type="button"
                        onClick={() => {
                          void session.exportDiagnostics();
                          setStreamMenuOpen(false);
                        }}
                      >
                        <AlertCircleIcon />
                        <span>Relatar um problema</span>
                      </button>
                    </div>
                  )}

                  <div className="dock-stream-split-btn">
                    <button
                      className="dock-stream-main-btn is-sharing"
                      type="button"
                      title="Parar de transmitir"
                      onClick={() => void session.stopSharing()}
                    >
                      <ScreenOffIcon />
                    </button>
                    <button
                      className={`dock-stream-chevron-btn is-sharing ${streamMenuOpen ? "is-active" : ""}`}
                      type="button"
                      title="Opções de transmissão"
                      onClick={() => setStreamMenuOpen((v) => !v)}
                    >
                      <ChevronUpIcon />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="dock-action-btn is-share-idle"
                  type="button"
                  onClick={() => void session.openSourcePicker()}
                  title="Compartilhar tela"
                >
                  <ScreenCastIcon />
                  <span>Compartilhar</span>
                </button>
              )}

              <button className={`dock-icon-btn ${state.chatPanelOpen ? "is-active" : ""}`} type="button" title="Chat" onClick={handleToggleChat}>
                <MessageSquareIcon />
                {unreadChatCount > 0 && !state.chatPanelOpen && <span className="dock-badge">{unreadChatCount}</span>}
              </button>


              <button className="dock-icon-btn" type="button" title="Configurações" onClick={() => setSettingsOpen(true)}>
                <GearIcon />
              </button>

              <button className="dock-action-btn is-hangup" type="button" title="Sair da chamada" onClick={() => void session.close()}>
                <PhoneOffIcon />
                <span>{isConnected ? "Desconectar" : "Sair"}</span>
              </button>
            </div>
          </div>
        </main>


        {/* Right Collapsible Chat Drawer (Resizable) */}
        {state.chatPanelOpen && (
          <aside className="discord-chat-drawer" style={{ width: `${chatWidth}px` }}>
            {/* Chat Resize Handle */}
            <div
              className="resize-handle resize-handle-left"
              onMouseDown={startChatResize}
              title="Arraste para redimensionar o chat"
            />

            <div className="chat-header">
              <h3>Chat da Chamada</h3>
              <button className="icon-action-button" type="button" onClick={() => session.toggleChatPanel(false)} aria-label="Fechar chat">
                <XCloseIcon />
              </button>
            </div>

            <div className="chat-messages-container">
              {!isConnected && (
                <div className="chat-notice">
                  Você está sozinho na chamada. As mensagens serão entregues assim que um participante se conectar.
                </div>
              )}
              {state.chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-message-item ${msg.senderName === state.localUserName ? "is-self" : ""}`}>
                  <UserAvatar
                    name={msg.senderName}
                    avatar={msg.senderName === state.localUserName ? state.localUserAvatar : state.remoteUserAvatar}
                    isSelf={msg.senderName === state.localUserName}
                    className="chat-avatar"
                  />
                  <div className="chat-bubble">

                    <div className="chat-meta">
                      <strong>{msg.senderName}</strong>
                      <small>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                      <button
                        className="chat-msg-delete-btn"
                        type="button"
                        title="Excluir mensagem"
                        aria-label="Excluir mensagem"
                        onClick={() => session.deleteChatMessage(msg.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <p className="chat-text">{msg.text}</p>
                  </div>
                </div>
              ))}
              <div ref={chatMessagesEndRef} />
            </div>


            <form className="chat-input-box" onSubmit={handleSendChat}>
              <input
                className="chat-text-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Conversar no canal…"
              />
              <button className="chat-send-btn" type="submit" disabled={!chatText.trim()} aria-label="Enviar">
                <SendIcon />
              </button>
            </form>
          </aside>
        )}
      </div>


      {/* Discord-style Screen Context Menu */}
      {stageContextMenu && (
        <div
          ref={contextMenuRef}
          className="discord-context-menu"
          style={{
            top: Math.min(typeof window !== "undefined" ? window.innerHeight - 380 : 300, Math.max(10, stageContextMenu.y)),
            left: Math.min(typeof window !== "undefined" ? window.innerWidth - 260 : 300, Math.max(10, stageContextMenu.x)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Se clicou no container da tela de outro participante */}
          {stageContextMenu.target === "remote" && (
            <>
              {remoteSharing && (
                <>
                  {watchingRemote ? (
                    <button
                      className="context-menu-item is-danger"
                      type="button"
                      onClick={() => {
                        handleStopWatching();
                        setStageContextMenu(null);
                      }}
                    >
                      <ScreenOffIcon />
                      <span>Parar de ver a tela</span>
                    </button>
                  ) : (
                    <button
                      className="context-menu-item is-primary-item"
                      type="button"
                      onClick={() => {
                        handleStartWatching();
                        setStageContextMenu(null);
                      }}
                    >
                      <ScreenCastIcon />
                      <span>Ver tela</span>
                    </button>
                  )}
                  <div className="context-menu-divider" />
                </>
              )}

              {/* Zoom Submenu */}
              <div className="context-menu-submenu-wrapper">
                <button
                  className="context-menu-item with-chevron"
                  type="button"
                  onClick={() => setContextZoomOpen((v) => !v)}
                >
                  <ZoomInIcon />
                  <span>Zoom da tela ({Math.round(zoomLevel * 100)}%)</span>
                  <span className={`menu-chevron ${contextZoomOpen ? "is-open" : ""}`}><ChevronRightIcon /></span>
                </button>

                {contextZoomOpen && (
                  <div className="context-submenu-box">
                    {[1, 1.25, 1.5, 2, 2.5, 3].map((z) => (
                      <button
                        key={z}
                        type="button"
                        className={`context-menu-subitem ${zoomLevel === z ? "is-active" : ""}`}
                        onClick={() => {
                          setZoomLevel(z);
                          if (z === 1) setPanOffset({ x: 0, y: 0 });
                          setStageContextMenu(null);
                        }}
                      >
                        <span>{Math.round(z * 100)}%</span>
                        {zoomLevel === z && <CheckCircleIcon />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ajuste de Vídeo */}
              <button
                className="context-menu-item"
                type="button"
                onClick={() => {
                  setVideoFit((v) => (v === "contain" ? "cover" : "contain"));
                  setStageContextMenu(null);
                }}
              >
                <MonitorIcon />
                <span>{videoFit === "contain" ? "Preencher tela (Cortar)" : "Ajustar à janela (Original)"}</span>
              </button>

              {/* Silenciar / Ativar áudio */}
              {remoteSharing && watchingRemote && (
                <button
                  className="context-menu-item"
                  type="button"
                  onClick={() => {
                    setRemoteMuted((v) => !v);
                    setStageContextMenu(null);
                  }}
                >
                  {remoteMuted ? <SpeakerMuteIcon /> : <SpeakerOnIcon />}
                  <span>{remoteMuted ? "Ativar som" : "Silenciar áudio"}</span>
                </button>
              )}

              {/* Modo Grade / Foco quando ambas as telas estão ativas */}
              {dualSharing && (
                <button
                  className="context-menu-item"
                  type="button"
                  onClick={() => {
                    setLayoutMode((m) => (m === "grid" ? "focus" : "grid"));
                    setStageContextMenu(null);
                  }}
                >
                  {isGridActive ? <FocusViewIcon /> : <GridViewIcon />}
                  <span>{isGridActive ? "Mudar para Modo Foco" : "Mudar para Modo Grade"}</span>
                </button>
              )}


              {/* Tela Cheia */}
              <button
                className="context-menu-item"
                type="button"
                onClick={() => {
                  void requestFullscreen();
                  setStageContextMenu(null);
                }}
              >
                <FullscreenIcon />
                <span>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
              </button>


              <div className="context-menu-divider" />

              {/* Relatar um problema */}
              <button
                className="context-menu-item is-muted"
                type="button"
                onClick={() => {
                  void session.exportDiagnostics();
                  setStageContextMenu(null);
                }}
              >
                <AlertCircleIcon />
                <span>Relatar um problema</span>
              </button>
            </>
          )}

          {/* Se clicou no container da própria tela */}
          {stageContextMenu.target === "local" && (
            <>
              {localSharing && (
                <>
                  <button
                    className="context-menu-item is-danger"
                    type="button"
                    onClick={() => {
                      void session.stopSharing();
                      setStageContextMenu(null);
                    }}
                  >
                    <ScreenOffIcon />
                    <span>Parar de transmitir</span>
                  </button>

                  <button
                    className="context-menu-item"
                    type="button"
                    onClick={() => {
                      void session.openSourcePicker();
                      setStageContextMenu(null);
                    }}
                  >
                    <ScreenSwitchIcon />
                    <span>Alterar a Transmissão</span>
                  </button>

                  {/* Qualidade Submenu */}
                  <div className="context-menu-submenu-wrapper">
                    <button
                      className="context-menu-item with-chevron"
                      type="button"
                      onClick={() => setContextQualityOpen((v) => !v)}
                    >
                      <SlidersIcon />
                      <span>Qualidade da transmissão</span>
                      <span className={`menu-chevron ${contextQualityOpen ? "is-open" : ""}`}><ChevronRightIcon /></span>
                    </button>

                    {contextQualityOpen && (
                      <div className="context-submenu-box">
                        <span className="context-subgroup-title">Resolução</span>
                        <div className="context-subgroup-row">
                          {(["720p", "1080p", "1440p"] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              className={`quality-opt-pill ${session.resolution === r ? "is-selected" : ""}`}
                              onClick={() => {
                                session.setResolution(r);
                              }}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                        <span className="context-subgroup-title" style={{ marginTop: "8px" }}>FPS</span>
                        <div className="context-subgroup-row">
                          {([30, 60] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`quality-opt-pill ${session.fps === f ? "is-selected" : ""}`}
                              onClick={() => {
                                session.setFps(f);
                              }}
                            >
                              {f} FPS
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Compartilhar áudio switch */}
                  <label className="context-menu-item is-switch-item" onClick={(e) => e.stopPropagation()}>
                    <div className="stream-switch-label-row">
                      <SpeakerOnIcon />
                      <span>Compartilhar áudio da transmissão</span>
                    </div>
                    <div className="switch-toggle-wrapper is-mini">
                      <input
                        type="checkbox"
                        className="switch-toggle-input"
                        checked={state.includeSystemAudio}
                        onChange={() => void session.toggleSystemAudio()}
                        aria-label="Compartilhar áudio da transmissão"
                      />
                      <div className={`switch-toggle-track ${state.includeSystemAudio ? "is-checked" : ""}`}>
                        <div className="switch-toggle-thumb" />
                      </div>
                    </div>
                  </label>

                  <div className="context-menu-divider" />
                </>
              )}

              {/* Zoom Submenu */}
              <div className="context-menu-submenu-wrapper">
                <button
                  className="context-menu-item with-chevron"
                  type="button"
                  onClick={() => setContextZoomOpen((v) => !v)}
                >
                  <ZoomInIcon />
                  <span>Zoom da tela ({Math.round(zoomLevel * 100)}%)</span>
                  <span className={`menu-chevron ${contextZoomOpen ? "is-open" : ""}`}><ChevronRightIcon /></span>
                </button>

                {contextZoomOpen && (
                  <div className="context-submenu-box">
                    {[1, 1.25, 1.5, 2, 2.5, 3].map((z) => (
                      <button
                        key={z}
                        type="button"
                        className={`context-menu-subitem ${zoomLevel === z ? "is-active" : ""}`}
                        onClick={() => {
                          setZoomLevel(z);
                          if (z === 1) setPanOffset({ x: 0, y: 0 });
                          setStageContextMenu(null);
                        }}
                      >
                        <span>{Math.round(z * 100)}%</span>
                        {zoomLevel === z && <CheckCircleIcon />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ajuste de Vídeo */}
              <button
                className="context-menu-item"
                type="button"
                onClick={() => {
                  setVideoFit((v) => (v === "contain" ? "cover" : "contain"));
                  setStageContextMenu(null);
                }}
              >
                <MonitorIcon />
                <span>{videoFit === "contain" ? "Preencher tela (Cortar)" : "Ajustar à janela (Original)"}</span>
              </button>

              {/* Modo Grade / Foco quando ambas as telas estão ativas */}
              {dualSharing && (
                <button
                  className="context-menu-item"
                  type="button"
                  onClick={() => {
                    setLayoutMode((m) => (m === "grid" ? "focus" : "grid"));
                    setStageContextMenu(null);
                  }}
                >
                  {isGridActive ? <FocusViewIcon /> : <GridViewIcon />}
                  <span>{isGridActive ? "Mudar para Modo Foco" : "Mudar para Modo Grade"}</span>
                </button>
              )}


              {/* Tela Cheia */}
              <button
                className="context-menu-item"
                type="button"
                onClick={() => {
                  void requestFullscreen();
                  setStageContextMenu(null);
                }}
              >
                <FullscreenIcon />
                <span>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
              </button>


              <div className="context-menu-divider" />

              {/* Relatar um problema */}
              <button
                className="context-menu-item is-muted"
                type="button"
                onClick={() => {
                  void session.exportDiagnostics();
                  setStageContextMenu(null);
                }}
              >
                <AlertCircleIcon />
                <span>Relatar um problema</span>
              </button>
            </>
          )}
        </div>
      )}


      {/* Modals */}
      {session.sourcePickerOpen && (

        <SourceModal sources={session.sources} onClose={session.closeSourcePicker} onSelect={session.selectSource} />
      )}

      {state.sessionModalOpen && (
        <SessionModal session={session} onClose={() => session.toggleSessionModal(false)} />
      )}

      {settingsOpen && (
        <SettingsModal session={session} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
};


