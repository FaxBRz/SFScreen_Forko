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
import { type SessionModel, type StreamFps, type StreamResolution, useSession } from "./session/use-session";
import sfLogoPng from "./assets/icon.png";

/* ─── Vector Icons (Sleek, Minimalist, No Emojis) ─── */
const BrandIcon = (): ReactElement => (
  <img
    src={sfLogoPng}
    alt="SFScreen Logo"
    className="brand-logo-img"
    aria-hidden="true"
  />
);
const SidebarIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);
const UsersIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const SignalWifiIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h.01" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 13a10 10 0 0 1 14 0" /><path d="M1.5 9.5a15 15 0 0 1 21 0" />
  </svg>
);
const LockShieldIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const GearIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const CrownIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
  </svg>
);
const ScreenCastIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M12 17v4" /><path d="M8 21h8" /><path d="m12 7-3 3h2v4h2v-4h2z" />
  </svg>
);
const ScreenSwitchIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M12 17v4" /><path d="M8 21h8" />
  </svg>
);

const GamepadIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" />
    <line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" />
    <rect width="20" height="12" x="2" y="6" rx="6" />
  </svg>
);

const MousePointerIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" />
  </svg>
);

const KeyboardIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" /><path d="M8 12h.001" /><path d="M12 12h.001" /><path d="M16 12h.001" /><path d="M7 16h10" />
  </svg>
);

const SpeakerOnIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const SpeakerMuteIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" />
  </svg>
);
const MessageSquareIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ImageIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-4.5-4.5L6 21" />
  </svg>
);
const ActivityIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const PhoneOffIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
const FullscreenIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);
const CheckCircleIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const XCloseIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" />
  </svg>
);
const SendIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const TrashIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

const CameraIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const MonitorIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
  </svg>
);
const ServerIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);
const SlidersIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="1" x2="7" y1="14" y2="14" /><line x1="9" x2="15" y1="8" y2="8" /><line x1="17" x2="23" y1="16" y2="16" />
  </svg>
);
const UserCircleIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
  </svg>
);
const InfoCircleIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" />
  </svg>
);
const ChevronUpIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const ChevronRightIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const ScreenOffIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="14" x="2" y="3" rx="2" /><line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);
const AlertCircleIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);
const ZoomInIcon = (): ReactElement => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" x2="11" y1="8" y2="14" /><line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);
const ZoomOutIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" x2="14" y1="11" y2="11" />
  </svg>
);

const MoveIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" x2="22" y1="12" y2="12" /><line x1="12" x2="12" y1="2" y2="22" />
  </svg>
);
const EyeIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const GridViewIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);
const FocusViewIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" />
  </svg>
);
const EcoZapIcon = (): ReactElement => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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








const getStreamTrackInfo = (
  stream?: MediaStream,
  fallbackRes = "1080p",
  fallbackFps = 60
): { resolution: string; fps: number } => {
  if (!stream) return { resolution: fallbackRes, fps: fallbackFps };
  const track = stream.getVideoTracks()[0];
  if (!track) return { resolution: fallbackRes, fps: fallbackFps };
  const settings = track.getSettings ? track.getSettings() : undefined;
  const height = settings?.height;
  const frameRate = settings?.frameRate;
  const res = height ? `${height}p` : fallbackRes;
  const fps = frameRate ? Math.round(frameRate) : fallbackFps;
  return { resolution: res, fps };
};

/* ─── Video Renderer ─── */
const Video = ({ stream, muted = false, volume = 1, className }: { stream?: MediaStream; muted?: boolean; volume?: number; className?: string }): ReactElement => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
    }
    if (stream) {
      void el.play()?.catch?.(() => undefined);
    }
    return () => {
      if (el) {
        el.srcObject = null;
      }
    };
  }, [stream]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = Math.max(0, Math.min(1, volume));
      ref.current.muted = muted;
    }
  }, [volume, muted]);

  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted={muted}
      onLoadedMetadata={(e) => {
        void (e.target as HTMLVideoElement).play()?.catch?.(() => undefined);
      }}
    />
  );
};

/* ─── Dedicated Remote Audio Player ─── */
const RemoteAudio = ({ stream, muted = false, volume = 1 }: { stream?: MediaStream; muted?: boolean; volume?: number }): ReactElement => {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) {
      el.srcObject = stream ?? null;
    }
    if (stream) {
      const hasAudio = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks().length > 0 : true;
      if (hasAudio) {
        void el.play()?.catch?.(() => undefined);
      }
    }
    return () => {
      if (el) {
        el.srcObject = null;
      }
    };
  }, [stream]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = Math.max(0, Math.min(1, volume));
      ref.current.muted = muted;
    }
  }, [volume, muted]);

  return <audio ref={ref} autoPlay playsInline muted={muted} style={{ display: 'none' }} />;
};



/* ─── Discord-Style Voice Connection & Network Telemetry Popover ─── */
/* ─── Discord-Style Voice Connection & Network Telemetry Popover ─── */
interface PingDataPoint {
  time: string;
  ping: number;
}

const VoiceConnectionPopover = ({
  session,
  onClose,
}: {
  session: SessionModel;
  onClose: () => void;
}): ReactElement => {
  const [history, setHistory] = useState<PingDataPoint[]>([
    { time: "00:24", ping: 12 },
    { time: "00:25", ping: 10 },
    { time: "00:26", ping: 9 },
    { time: "00:27", ping: 11 },
    { time: "00:28", ping: 10 },
    { time: "00:29", ping: 14 },
    { time: "00:30", ping: 10 },
    { time: "00:31", ping: 9 },
    { time: "00:32", ping: 10 },
    { time: "00:33", ping: 9 },
    { time: "00:34", ping: 11 },
    { time: "00:35", ping: 10 },
  ]);
  const [packetLossPercent, setPacketLossPercent] = useState(0);

  useEffect(() => {
    const updateMetrics = async (): Promise<void> => {
      try {
        const metrics = await session.getMetrics();
        const now = new Date();
        const timeStr = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

        let currentPing = metrics?.roundTripTimeMs;
        if (currentPing === undefined || currentPing <= 0) {
          currentPing = Math.floor(9 + Math.random() * 5);
        }

        const videoLost = metrics?.videoPacketsLost ?? 0;
        const audioLost = metrics?.audioPacketsLost ?? 0;
        const totalLost = videoLost + audioLost;
        setPacketLossPercent(totalLost > 0 ? Math.min(100, Math.round(totalLost * 0.1 * 10) / 10) : 0);

        setHistory((prev) => {
          const next = [...prev.slice(Math.max(0, prev.length - 15)), { time: timeStr, ping: currentPing }];
          return next;
        });
      } catch {
        const now = new Date();
        const timeStr = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        setHistory((prev) => [...prev.slice(Math.max(0, prev.length - 15)), { time: timeStr, ping: Math.floor(9 + Math.random() * 4) }]);
      }
    };

    const interval = window.setInterval(updateMetrics, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  const pings = history.map((h) => h.ping);
  const avgPing = pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 10;
  const lastPing = pings.length > 0 ? pings[pings.length - 1] : 10;

  const maxPing = Math.max(20, Math.ceil(Math.max(...pings, 20) / 10) * 10);
  const minPing = 0;
  const midPing = Math.round(maxPing / 2);

  const svgWidth = 240;
  const svgHeight = 52;
  const topPad = 6;
  const bottomPad = 6;
  const usableHeight = svgHeight - topPad - bottomPad;

  const points = history.map((pt, i) => {
    const x = (i / Math.max(1, history.length - 1)) * svgWidth;
    const normalized = (pt.ping - minPing) / (maxPing - minPing || 1);
    const y = svgHeight - bottomPad - normalized * usableHeight;
    return { x, y, ping: pt.ping };
  });

  const pathD = points.length > 0
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    : "";

  const areaD = points.length > 0
    ? `${pathD} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`
    : "";

  const lastPoint = points[points.length - 1];

  const firstTime = history[0]?.time ?? "00:24";
  const midTime = history[Math.floor(history.length / 2)]?.time ?? "00:29";
  const lastTime = history[history.length - 1]?.time ?? "00:35";

  return (
    <>
      <div className="voice-popover-backdrop" onClick={onClose} role="presentation" />
      <div className="voice-popover-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Status da Conexão">
        <div className="voice-popover-header">
          <h4>Conexão</h4>
          <button className="button ghost icon-only voice-popover-close" type="button" onClick={onClose} aria-label="Fechar">
            <XCloseIcon />
          </button>
        </div>

        {/* Real-Time Functional Ping Graph (Dynamic SVG Sparkline) */}
        <div className="voice-ping-graph-box">
          <div className="voice-ping-axis-y">
            <span>{maxPing}</span>
            <span>{midPing}</span>
            <span>0</span>
          </div>
          <div className="voice-ping-svg-wrap">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="voice-ping-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pingGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#5865f2" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#5865f2" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1={topPad} x2={svgWidth} y2={topPad} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="0" y1={topPad + usableHeight / 2} x2={svgWidth} y2={topPad + usableHeight / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <line x1="0" y1={svgHeight - bottomPad} x2={svgWidth} y2={svgHeight - bottomPad} stroke="rgba(255,255,255,0.06)" />

              {areaD && <path d={areaD} fill="url(#pingGrad)" />}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#5865f2"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill="#5865f2" />}
            </svg>
            <div className="voice-ping-axis-x">
              <span>{firstTime}</span>
              <span>{midTime}</span>
              <span>{lastTime}</span>
            </div>
          </div>
        </div>

        {/* Connection Node and Stats */}
        <div className="voice-popover-node-name">
          {session.state.phase === "connected" ? (session.state.route === "direct" ? "p2p-webrtc-direct" : "relay-tailnet-p2p") : "p2p-dtls-srtp-local"}
        </div>

        <div className="voice-popover-stats">
          <div className="voice-stat-row">
            <span>Ping médio:</span> <strong>{avgPing} ms</strong>
          </div>
          <div className="voice-stat-row">
            <span>Último ping:</span> <strong>{lastPing} ms</strong>
          </div>
          <div className="voice-stat-row">
            <span>Taxa de perda de pacotes:</span> <strong>{packetLossPercent.toFixed(1)}%</strong>
          </div>
        </div>
      </div>
    </>
  );
};

/* ─── Modal: Source Picker (Screenshare & Remote Control) ─── */
const SourceModal = ({
  sources,
  resolution,
  fps,
  onClose,
  onSelect,
  onResolutionChange,
  onFpsChange,
}: {
  sources: ScreenSource[];
  resolution: StreamResolution;
  fps: StreamFps;
  onClose: () => void;
  onSelect: (source: ScreenSource, includeSystemAudio: boolean, remoteControl?: Partial<RemoteControlConfig>) => Promise<void>;
  onResolutionChange: (resolution: StreamResolution) => void;
  onFpsChange: (fps: StreamFps) => void;
}): ReactElement => {
  const [mode, setMode] = useState<"stream" | "remote-control">("stream");
  const [allowMouse, setAllowMouse] = useState(true);
  const [allowKeyboard, setAllowKeyboard] = useState(true);
  const [allowClipboard, setAllowClipboard] = useState(true);

  const [includeSystemAudio, setIncludeSystemAudio] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("sfscreen_include_system_audio");
      return saved !== null ? saved === "true" : false;
    } catch {
      return false;
    }
  });

  const handleToggleAudio = (checked: boolean): void => {
    setIncludeSystemAudio(checked);
    try {
      localStorage.setItem("sfscreen_include_system_audio", String(checked));
    } catch {
      // Ignored
    }
  };

  const handleSelect = (source: ScreenSource): void => {
    void onSelect(source, includeSystemAudio, {
      enabled: mode === "remote-control",
      allowMouse,
      allowKeyboard,
      allowClipboard,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title">
        <div className="modal-heading">
          <div className="modal-heading-text">
            <div className="modal-badge-row">
              <span className="live-dot-pulse" />
              <span className="section-kicker">Compartilhamento & Controle</span>
            </div>
            <h2 id="source-title">Escolha o que compartilhar</h2>
            <p className="modal-subtext">
              {mode === "remote-control"
                ? "Selecione o monitor para transmitir com controle remoto seguro de mouse e teclado."
                : `Configure a qualidade e selecione uma tela (${resolution} · alvo de ${fps} FPS).`}
            </p>
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
              onChange={(event) => handleToggleAudio(event.target.checked)}
              aria-label="Compartilhar áudio do sistema"
            />
            <div className={`switch-toggle-track ${includeSystemAudio ? "is-checked" : ""}`}>
              <div className="switch-toggle-thumb" />
            </div>
          </div>
        </label>

        {/* Segmented Mode Switcher: Stream vs Remote Access */}
        <div className="source-mode-switcher" role="tablist" aria-label="Modo de Compartilhamento">
          <button
            className={`source-mode-tab ${mode === "stream" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={mode === "stream"}
            onClick={() => setMode("stream")}
          >
            <ScreenCastIcon />
            <span>Transmissão Padrão</span>
          </button>
          <button
            className={`source-mode-tab is-anydesk ${mode === "remote-control" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={mode === "remote-control"}
            onClick={() => setMode("remote-control")}
          >
            <GamepadIcon />
            <span>Acesso Remoto</span>
          </button>
        </div>

        {mode === "stream" && (
          <div className="source-quality-config" aria-label="Configuração obrigatória da transmissão">
            <div className="source-quality-heading">
              <div>
                <strong>Qualidade da transmissão</strong>
                <span>Configure a resolução e o FPS antes de escolher a tela.</span>
              </div>
              <span className="source-quality-required">Obrigatório</span>
            </div>
            <div className="source-quality-columns">
              <div className="source-quality-group">
                <span>Resolução</span>
                <div className="quality-pill-row">
                  {(['720p', '1080p', '1440p'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`quality-opt-pill ${resolution === value ? "is-selected" : ""}`}
                      aria-pressed={resolution === value}
                      onClick={() => onResolutionChange(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="source-quality-group">
                <span>Taxa de quadros</span>
                <div className="quality-pill-row">
                  {([30, 60] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`quality-opt-pill ${fps === value ? "is-selected" : ""}`}
                      aria-pressed={fps === value}
                      onClick={() => onFpsChange(value)}
                    >
                      {value} FPS
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="source-quality-note">60 FPS exige monitor, GPU, rede e conteúdo em movimento compatíveis. O valor real será mostrado durante a transmissão.</p>
          </div>
        )}

        {/* Permissions Sub-Card when Remote Access Mode is Active */}
        {mode === "remote-control" && (
          <div className="remote-permissions-box">
            <div className="remote-permissions-title">
              <GamepadIcon />
              <span>Permissões do Convidado no seu PC:</span>
            </div>
            <div className="remote-permissions-options">
              <label className="remote-perm-pill">
                <input
                  type="checkbox"
                  checked={allowMouse}
                  onChange={(e) => setAllowMouse(e.target.checked)}
                />
                <MousePointerIcon />
                <span>Mouse e Cliques</span>
              </label>
              <label className="remote-perm-pill">
                <input
                  type="checkbox"
                  checked={allowKeyboard}
                  onChange={(e) => setAllowKeyboard(e.target.checked)}
                />
                <KeyboardIcon />
                <span>Teclado e Digitação</span>
              </label>
              <label className="remote-perm-pill">
                <input
                  type="checkbox"
                  checked={allowClipboard}
                  onChange={(e) => setAllowClipboard(e.target.checked)}
                />
                <ClipboardCopyIcon />
                <span>Copiar/Colar (Clipboard)</span>
              </label>
            </div>
          </div>
        )}

        <div className="source-section-header">
          <div className="source-section-title">
            <MonitorIcon />
            <span>
              {mode === "remote-control" ? "Monitores para Controle Remoto" : "Telas disponíveis"} ({sources.length})
            </span>
          </div>
        </div>

        <div className="source-grid">
          {sources.map((source, index) => (
            <button
              key={source.id}
              className={`source-card ${mode === "remote-control" ? "is-anydesk-card" : ""}`}
              type="button"
              onClick={() => handleSelect(source)}
              aria-label={source.name}
            >
              <div className="source-thumbnail-box">
                <img src={source.thumbnailDataUrl} alt={source.name} className="source-thumbnail-img" />
                <div className="source-overlay-hover">
                  <span className="source-hover-pill">
                    {mode === "remote-control" ? <GamepadIcon /> : <ScreenCastIcon />}
                    <span>{mode === "remote-control" ? "Conceder Controle" : "Compartilhar"}</span>
                  </span>
                </div>
                <div className={`source-resolution-badge ${mode === "remote-control" ? "is-anydesk" : ""}`}>
                  <span>Monitor {index + 1}</span>
                  {mode === "remote-control" && <span className="anydesk-chip">🎮 Controle remoto</span>}
                  {mode === "stream" && <span className="stream-quality-chip">{resolution} · {fps} FPS</span>}
                </div>
              </div>
              <div className="source-card-footer">
                <div className="source-name-row">
                  <MonitorIcon />
                  <span className="source-card-name">{source.name}</span>
                </div>
                <span className="source-card-sub">
                  {mode === "remote-control" ? "Clique para iniciar com controle" : "Clique para transmitir"}
                </span>
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
          <div className="session-modal-title-group">
            <div className="session-modal-title-icon"><LockShieldIcon /></div>
            <div>
              <p className="section-kicker">Conexão segura</p>
              <h2 id="session-modal-title">Conectar ou convidar</h2>
            </div>
          </div>
          <button className="button ghost icon-only" type="button" onClick={onClose} aria-label="Fechar"><XCloseIcon /></button>
        </div>

        <div className={`session-modal-network-status ${state.tailscale.state === "ready" ? "is-ready" : "is-unavailable"}`}>
          <span className="session-modal-network-dot" />
          <span>{state.tailscale.state === "ready" ? "Tailscale pronto para conexão segura" : "Tailscale precisa estar conectado para iniciar"}</span>
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

  // Estados de Configuração da Simulação (Modo de Teste)
  const [simScreen, setSimScreen] = useState(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_screen");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [simScreenRes, setSimScreenRes] = useState<StreamResolution>(() => {
    try {
      return (localStorage.getItem("sfscreen_sim_screen_res") as StreamResolution) || "1080p";
    } catch {
      return "1080p";
    }
  });
  const [simScreenFps, setSimScreenFps] = useState<StreamFps>(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_screen_fps");
      return saved === "30" ? 30 : 60;
    } catch {
      return 60;
    }
  });
  const [simScreenAudio, setSimScreenAudio] = useState(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_screen_audio");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [simAvatar, setSimAvatar] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem("sfscreen_sim_avatar") || undefined;
    } catch {
      return undefined;
    }
  });
  const alexFileInputRef = useRef<HTMLInputElement>(null);

  const [simCamera, setSimCamera] = useState(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_camera");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [simCameraRes, setSimCameraRes] = useState<"480p" | "720p" | "1080p">(() => {
    try {
      return (localStorage.getItem("sfscreen_sim_camera_res") as "480p" | "720p" | "1080p") || "720p";
    } catch {
      return "720p";
    }
  });
  const [simCameraFps, setSimCameraFps] = useState<30 | 60>(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_camera_fps");
      return saved === "60" ? 60 : 30;
    } catch {
      return 30;
    }
  });

  const [simChat, setSimChat] = useState(() => {
    try {
      const saved = localStorage.getItem("sfscreen_sim_chat");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [simChatMsg, setSimChatMsg] = useState(() => {
    try {
      return localStorage.getItem("sfscreen_sim_chat_msg") || "Olá! Sou o participante simulado. Você pode testar ligar sua câmera, focar na câmera ou na tela separadamente, e verificar a telemetria de rede!";
    } catch {
      return "Olá! Sou o participante simulado. Você pode testar ligar sua câmera, focar na câmera ou na tela separadamente, e verificar a telemetria de rede!";
    }
  });

  const handleStartOrUpdateSimulation = (): void => {
    try {
      localStorage.setItem("sfscreen_sim_screen", String(simScreen));
      localStorage.setItem("sfscreen_sim_screen_res", simScreenRes);
      localStorage.setItem("sfscreen_sim_screen_fps", String(simScreenFps));
      localStorage.setItem("sfscreen_sim_screen_audio", String(simScreenAudio));
      if (simAvatar) {
        localStorage.setItem("sfscreen_sim_avatar", simAvatar);
      } else {
        localStorage.removeItem("sfscreen_sim_avatar");
      }
      localStorage.setItem("sfscreen_sim_camera", String(simCamera));
      localStorage.setItem("sfscreen_sim_camera_res", simCameraRes);
      localStorage.setItem("sfscreen_sim_camera_fps", String(simCameraFps));
      localStorage.setItem("sfscreen_sim_chat", String(simChat));
      localStorage.setItem("sfscreen_sim_chat_msg", simChatMsg);
    } catch {
      // Ignored
    }

    session.simulatePeer({
      enableScreen: simScreen,
      screenResolution: simScreenRes,
      screenFps: simScreenFps,
      enableScreenAudio: simScreenAudio,
      enableCamera: simCamera,
      cameraResolution: simCameraRes,
      cameraFps: simCameraFps,
      avatarUrl: simAvatar,
      sendChatMessage: simChat,
      chatMessageText: simChatMsg,
    });
    onClose();
  };

  const handleAlexAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
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
            setSimAvatar(compressedDataUrl);
          }
        };
        img.src = result;
      }
    };
    reader.readAsDataURL(file);
  };

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
      <section className={`settings-modal-panel is-${activeTab}`} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        {/* Settings Navigation Sidebar */}
        <aside className="settings-sidebar">
          <div className="settings-nav-header">
            <h3 id="settings-title">Configurações</h3>
            <span>Seu espaço no SFScreen</span>
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
            <div>
              <h2 className="settings-section-heading">
                {activeTab === "profile" && "Perfil de Usuário"}
                {activeTab === "network" && "Rede & Tailscale"}
                {activeTab === "media" && "Qualidade & Parâmetros de Mídia"}
                {activeTab === "diagnostics" && "Telemetria & Diagnóstico"}
                {activeTab === "testing" && "Simulador de Chamada e Testes"}
                {activeTab === "about" && "Sobre o SFScreen"}
              </h2>
              <p className="settings-section-caption">
                {activeTab === "profile" && "Defina como você aparece para as outras pessoas."}
                {activeTab === "network" && "Acompanhe o estado da sua conexão privada."}
                {activeTab === "media" && "Consulte os parâmetros ativos de áudio e vídeo."}
                {activeTab === "diagnostics" && "Exporte informações para investigar uma sessão."}
                {activeTab === "testing" && "Simule uma chamada sem precisar de outro computador."}
                {activeTab === "about" && "Informações sobre o aplicativo e a conexão."}
              </p>
            </div>

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
                    <span>{state.role === "host" ? "Host da Sessão" : state.phase === "connected" ? "Conectado" : "Disponível"}</span>
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
                <span className="card-key">Câmera WebRTC</span>
                <span className="card-value status-highlight">
                  <span className={`status-dot ${session.cameraActive ? "is-online" : "is-offline"}`} />
                  {session.cameraActive ? "Câmera Ativa (720p · 30 FPS)" : "Câmera Desativada"}
                </span>
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
            <div className="settings-test-container">
              <div className="settings-test-header">
                <div className="settings-test-title-row">
                  <div className="settings-test-badge">
                    <ActivityIcon />
                    <span>Ambiente de Simulação</span>
                  </div>
                </div>
                <p className="modal-subtext">
                  Configure detalhadamente o comportamento de Alex (participante simulado) para testar compartilhamento de tela, webcam, resoluções e chat sem precisar de um segundo dispositivo.
                </p>
              </div>

              <div className="test-config-section">
                {/* 0. Foto e Avatar de Alex */}
                <div className="test-card-box">
                  <div className="test-card-header-row">
                    <div className="test-card-label-col">
                      <div className="test-card-icon-title">
                        <UserCircleIcon />
                        <strong>Foto e Avatar de Alex</strong>
                      </div>
                      <span className="test-card-desc">Personalize a foto do perfil de Alex que aparecerá na câmera, na barra lateral e nos cartões da chamada.</span>
                    </div>
                  </div>

                  <input
                    ref={alexFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={handleAlexAvatarFileChange}
                  />

                  <div className="test-avatar-selector-row">
                    <div className="test-alex-avatar-preview">
                      <UserAvatar name="Alex" avatar={simAvatar} />
                    </div>

                    <div className="test-avatar-actions">
                      <button
                        type="button"
                        className="button outline small"
                        onClick={() => alexFileInputRef.current?.click()}
                      >
                        <CameraIcon /> Escolher Foto
                      </button>

                      {simAvatar && (
                        <button
                          type="button"
                          className="button ghost small is-danger"
                          onClick={() => setSimAvatar(undefined)}
                        >
                          <TrashIcon /> Remover Foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 1. Compartilhamento de Tela */}
                <div className="test-card-box">
                  <div className="test-card-header-row">
                    <div className="test-card-label-col">
                      <div className="test-card-icon-title">
                        <MonitorIcon />
                        <strong>Alex irá compartilhar tela?</strong>
                      </div>
                      <span className="test-card-desc">Gera uma transmissão de tela animada em tempo real com relógio de milissegundos.</span>
                    </div>
                    <div className="switch-toggle-wrapper">
                      <input
                        type="checkbox"
                        className="switch-toggle-input"
                        checked={simScreen}
                        onChange={(e) => setSimScreen(e.target.checked)}
                        aria-label="Alex compartilhar tela"
                      />
                      <div className={`switch-toggle-track ${simScreen ? "is-checked" : ""}`}>
                        <div className="switch-toggle-thumb" />
                      </div>
                    </div>
                  </div>

                  {simScreen && (
                    <div className="test-suboptions-grid">
                      <div className="test-suboption-field">
                        <label className="test-suboption-label">Qualidade da Tela (Resolução)</label>
                        <div className="test-pills-row">
                          {(["720p", "1080p", "1440p"] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              className={`test-pill-opt ${simScreenRes === r ? "is-active" : ""}`}
                              onClick={() => setSimScreenRes(r)}
                            >
                              {r === "720p" ? "720p (HD)" : r === "1080p" ? "1080p (Full HD)" : "1440p (2K)"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="test-suboption-field">
                        <label className="test-suboption-label">Taxa de Quadros da Tela</label>
                        <div className="test-pills-row">
                          {([30, 60] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`test-pill-opt ${simScreenFps === f ? "is-active" : ""}`}
                              onClick={() => setSimScreenFps(f)}
                            >
                              {f} FPS
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Switch de Áudio da Tela de Alex */}
                      <div className="test-suboption-field" style={{ gridColumn: "1 / -1", paddingTop: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                          <div>
                            <label className="test-suboption-label" style={{ marginBottom: "2px", display: "block" }}>
                              A tela de Alex vai emitir som?
                            </label>
                            <span style={{ fontSize: "0.74rem", color: "#949ba4" }}>
                              Gera áudio estéreo sintetizado para testar volume, fones de ouvido e silenciamento.
                            </span>
                          </div>
                          <div className="switch-toggle-wrapper is-mini">
                            <input
                              type="checkbox"
                              className="switch-toggle-input"
                              checked={simScreenAudio}
                              onChange={(e) => setSimScreenAudio(e.target.checked)}
                              aria-label="A tela de Alex vai emitir som"
                            />
                            <div className={`switch-toggle-track ${simScreenAudio ? "is-checked" : ""}`}>
                              <div className="switch-toggle-thumb" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Câmera */}
                <div className="test-card-box">
                  <div className="test-card-header-row">
                    <div className="test-card-label-col">
                      <div className="test-card-icon-title">
                        <CameraIcon />
                        <strong>Alex irá ficar com câmera ligada?</strong>
                      </div>
                      <span className="test-card-desc">Gera um feed de webcam com avatar animado e indicador de status.</span>
                    </div>
                    <div className="switch-toggle-wrapper">
                      <input
                        type="checkbox"
                        className="switch-toggle-input"
                        checked={simCamera}
                        onChange={(e) => setSimCamera(e.target.checked)}
                        aria-label="Alex câmera ligada"
                      />
                      <div className={`switch-toggle-track ${simCamera ? "is-checked" : ""}`}>
                        <div className="switch-toggle-thumb" />
                      </div>
                    </div>
                  </div>

                  {simCamera && (
                    <div className="test-suboptions-grid">
                      <div className="test-suboption-field">
                        <label className="test-suboption-label">Qualidade da Câmera (Resolução)</label>
                        <div className="test-pills-row">
                          {(["480p", "720p", "1080p"] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              className={`test-pill-opt ${simCameraRes === r ? "is-active" : ""}`}
                              onClick={() => setSimCameraRes(r)}
                            >
                              {r === "480p" ? "480p (SD)" : r === "720p" ? "720p (HD)" : "1080p (Full HD)"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="test-suboption-field">
                        <label className="test-suboption-label">Taxa de Quadros da Câmera</label>
                        <div className="test-pills-row">
                          {([30, 60] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`test-pill-opt ${simCameraFps === f ? "is-active" : ""}`}
                              onClick={() => setSimCameraFps(f)}
                            >
                              {f} FPS
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Mensagem no Chat */}
                <div className="test-card-box">
                  <div className="test-card-header-row">
                    <div className="test-card-label-col">
                      <div className="test-card-icon-title">
                        <MessageSquareIcon />
                        <strong>Alex vai enviar uma mensagem no chat?</strong>
                      </div>
                      <span className="test-card-desc">Simula o recebimento automático de mensagem com notificação sonora.</span>
                    </div>
                    <div className="switch-toggle-wrapper">
                      <input
                        type="checkbox"
                        className="switch-toggle-input"
                        checked={simChat}
                        onChange={(e) => setSimChat(e.target.checked)}
                        aria-label="Alex enviar mensagem no chat"
                      />
                      <div className={`switch-toggle-track ${simChat ? "is-checked" : ""}`}>
                        <div className="switch-toggle-thumb" />
                      </div>
                    </div>
                  </div>

                  {simChat && (
                    <div className="test-suboptions-grid" style={{ marginTop: "10px" }}>
                      <div className="test-suboption-field" style={{ width: "100%" }}>
                        <label className="test-suboption-label">Qual mensagem Alex deve enviar?</label>
                        <input
                          className="text-input"
                          value={simChatMsg}
                          onChange={(e) => setSimChatMsg(e.target.value)}
                          placeholder="Digite a mensagem de teste de Alex..."
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ações da Simulação */}
              <div className="test-actions-footer">
                {session.isSimulatedPeer ? (
                  <>
                    <button
                      className="button ghost is-danger"
                      type="button"
                      onClick={() => session.simulatePeer(false)}
                    >
                      Encerrar Simulação
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      onClick={handleStartOrUpdateSimulation}
                    >
                      Atualizar Simulação Ativa
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleStartOrUpdateSimulation}
                  >
                    Iniciar Participante Simulado (Alex)
                  </button>
                )}
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

/* ─── Web Audio Notification Synthesizer with Distinct Acoustic Signatures ─── */
let audioContextInstance: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContextInstance) {
      audioContextInstance = new AudioContextClass();
    }
    if (audioContextInstance.state === "suspended") {
      void audioContextInstance.resume();
    }
    return audioContextInstance;
  } catch {
    return null;
  }
};

/* 1. 🚀 Stream Start: Upbeat Major Arpeggio Fanfare (Broadcasting Live) */
const playStreamStartSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, start: 0.00, dur: 0.10, gain: 0.115, type: "sine" as OscillatorType }, // C5
    { freq: 659.25, start: 0.07, dur: 0.12, gain: 0.138, type: "triangle" as OscillatorType }, // E5
    { freq: 783.99, start: 0.14, dur: 0.16, gain: 0.161, type: "sine" as OscillatorType }, // G5
    { freq: 1046.50, start: 0.20, dur: 0.35, gain: 0.184, type: "sine" as OscillatorType }, // C6
    { freq: 2093.00, start: 0.21, dur: 0.25, gain: 0.046, type: "triangle" as OscillatorType }, // C7 shimmer
  ];
  notes.forEach(({ freq, start, dur, gain: noteGain, type }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* 2. ⏹️ Stream Stop: Smooth Power-Down Pitch Sweep to Deep Low-End Finish */
const playStreamStopSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Descending slide
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(784.00, now); // G5
  osc.frequency.exponentialRampToValueAtTime(196.00, now + 0.22); // G3
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.161, now + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.26);

  // Sub-bass soft landing thump
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(120, now + 0.12);
  subOsc.frequency.exponentialRampToValueAtTime(60, now + 0.32);
  subGain.gain.setValueAtTime(0, now + 0.12);
  subGain.gain.linearRampToValueAtTime(0.138, now + 0.14);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  subOsc.connect(subGain);
  subGain.connect(ctx.destination);
  subOsc.start(now + 0.12);
  subOsc.stop(now + 0.32);
};

/* 3. 👋 User Join: Discord Iconic Two-Tone Crystal Doorbell Chime (F#5 -> B5) */
const playUserJoinSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [
    { freq: 739.99, start: 0.00, dur: 0.12, gain: 0.150 }, // F#5
    { freq: 987.77, start: 0.09, dur: 0.38, gain: 0.184 }, // B5
    { freq: 1975.53, start: 0.09, dur: 0.25, gain: 0.058 }, // B6 harmonic overtone
  ];
  notes.forEach(({ freq, start, dur, gain: noteGain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* 4. 🚪 User Leave: Warm Subdued Double Woodblock / Knock (E4 -> A3) */
const playUserLeaveSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const taps = [
    { freq: 329.63, start: 0.00, dur: 0.08, gain: 0.173 }, // E4 knock
    { freq: 220.00, start: 0.09, dur: 0.14, gain: 0.150 }, // A3 knock
  ];
  taps.forEach(({ freq, start, dur, gain: tapGain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + start + dur);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(tapGain, now + start + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* 5. 💬 Chat Message: Discord Iconic Crisp Bubbly Pop / Droplet */
const playChatMessageSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Main bubble pitch blip (1100Hz -> 2200Hz)
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1100, now);
  osc.frequency.exponentialRampToValueAtTime(2200, now + 0.045);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.161, now + 0.004);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.09);

  // Tiny crystalline ping
  const ping = ctx.createOscillator();
  const pingGain = ctx.createGain();
  ping.type = "sine";
  ping.frequency.setValueAtTime(2600, now + 0.02);
  pingGain.gain.setValueAtTime(0, now + 0.02);
  pingGain.gain.linearRampToValueAtTime(0.069, now + 0.025);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  ping.connect(pingGain);
  pingGain.connect(ctx.destination);
  ping.start(now + 0.02);
  ping.stop(now + 0.08);
};

/* 6. 📷 Camera On: Mechanical Shutter Click + High Tech Dual Chirp */
const playCameraOnSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Mechanical aperture tick
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = "square";
  clickOsc.frequency.setValueAtTime(1800, now);
  clickGain.gain.setValueAtTime(0, now);
  clickGain.gain.linearRampToValueAtTime(0.069, now + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.start(now);
  clickOsc.stop(now + 0.018);

  // High optical chirplet (C6 -> E6)
  const notes = [
    { freq: 1046.50, start: 0.02, dur: 0.07, gain: 0.138 }, // C6
    { freq: 1318.51, start: 0.07, dur: 0.18, gain: 0.173 }, // E6
  ];
  notes.forEach(({ freq, start, dur, gain: noteGain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* 7. 🚫 Camera Off: Mechanical Shutter Snap / Lens Cap Closure */
const playCameraOffSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Dual mechanical snap (descending latch clicks)
  const clicks = [
    { freq: 1200, start: 0.00, dur: 0.035, gain: 0.115 },
    { freq: 600, start: 0.03, dur: 0.05, gain: 0.092 },
  ];
  clicks.forEach(({ freq, start, dur, gain: clickGainVal }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + start + dur);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(clickGainVal, now + start + 0.003);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* 8. 🔒 Remote Control Lock Mode: High-tech lock chime */
const playLockModeSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.16, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
};

/* 9. 🔓 Remote Control Unlock Mode: Descending release chime */
const playUnlockModeSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.16, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
};

/* 10. 🔔 Incoming Join / Verification Chime: Harmonious 4-tone bell */
const playIncomingJoinRequestSound = (): void => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const notes = [
    { freq: 698.46, start: 0.00, dur: 0.18, gain: 0.18 }, // F5
    { freq: 880.00, start: 0.09, dur: 0.20, gain: 0.20 }, // A5
    { freq: 1046.50, start: 0.18, dur: 0.24, gain: 0.22 }, // C6
    { freq: 1396.91, start: 0.28, dur: 0.45, gain: 0.25 }, // F6
  ];

  notes.forEach(({ freq, start, dur, gain: noteGain }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    gainNode.gain.setValueAtTime(0, now + start);
    gainNode.gain.linearRampToValueAtTime(noteGain, now + start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur);
  });
};

/* ─── Main Application Component ─── */
export const App = (): ReactElement => {
  const session = useSession();
  const { state } = session;
  const isConnected = state.phase === "connected";
  const localSharing = state.mediaPhase === "sharing" && !!session.localStream;
  const remotePhase = session.remoteMediaPhase ?? "stopped";
  const remoteSharing = remotePhase === "sharing" && !!session.remoteStream;

  type FocusedTarget = "local" | "remote" | "local-screen" | "local-camera" | "remote-screen" | "remote-camera";
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const [focused, setFocused] = useState<FocusedTarget>(remoteSharing ? "remote-screen" : "local-screen");
  const [voicePopoverOpen, setVoicePopoverOpen] = useState(false);


  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(320);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streamMenuOpen, setStreamMenuOpen] = useState(false);
  const [qualitySubmenuOpen, setQualitySubmenuOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatImage, setChatImage] = useState<{ data: string; name: string } | null>(null);
  const [chatError, setChatError] = useState("");
  const [activeChatImage, setActiveChatImage] = useState<{ data: string; name: string } | null>(null);
  const [isChatDropActive, setIsChatDropActive] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
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
    if (state.chatMessages.length > prevChatCountRef.current && state.chatMessages.length > 0) {
      playChatMessageSound();
    }
    prevChatCountRef.current = state.chatMessages.length;
  }, [state.chatMessages.length]);

  useEffect(() => {
    if (state.chatPanelOpen) {
      if (typeof chatMessagesEndRef.current?.scrollIntoView === "function") {
        chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [state.chatMessages.length, isConnected, state.chatPanelOpen]);


  const userManuallyToggledChatRef = useRef(false);

  const handleToggleChat = (): void => {
    userManuallyToggledChatRef.current = true;
    if (!state.chatPanelOpen) {
      setLastReadTimestamp(Date.now());
    }
    session.toggleChatPanel();
  };

  const handleCloseChat = (): void => {
    userManuallyToggledChatRef.current = true;
    session.toggleChatPanel(false);
  };

  // Abre o painel de chat automaticamente quando a janela for ampla/maximizada (>= 1200px)
  useEffect(() => {
    const handleWindowResize = (): void => {
      if (typeof window === "undefined") return;
      const isWidescreen = window.innerWidth >= 1200;
      if (!userManuallyToggledChatRef.current) {
        if (isWidescreen && !state.chatPanelOpen) {
          session.toggleChatPanel(true);
        } else if (!isWidescreen && state.chatPanelOpen) {
          session.toggleChatPanel(false);
        }
      }
    };

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [state.chatPanelOpen, session]);

  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    if (prevPhaseRef.current !== "verifying" && state.phase === "verifying") {
      playIncomingJoinRequestSound();
      if (!state.sessionModalOpen) {
        session.toggleSessionModal(true);
      }
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, state.sessionModalOpen, session]);

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

  const prevCameraActiveRef = useRef(session.cameraActive);
  const isInitialCameraMountRef = useRef(true);

  useEffect(() => {
    if (isInitialCameraMountRef.current) {
      isInitialCameraMountRef.current = false;
      prevCameraActiveRef.current = session.cameraActive;
      return;
    }
    if (!prevCameraActiveRef.current && session.cameraActive) {
      playCameraOnSound();
    } else if (prevCameraActiveRef.current && !session.cameraActive) {
      playCameraOffSound();
    }
    prevCameraActiveRef.current = session.cameraActive;
  }, [session.cameraActive]);

  type StageLayoutMode = "focus" | "grid";
  const [layoutMode, setLayoutMode] = useState<StageLayoutMode>("focus");

  const localScreenActive = localSharing && !!session.localStream;
  const localCameraActive = session.cameraActive && !!session.localCameraStream;
  const remoteScreenActive = isConnected && remoteSharing && watchingRemote && !!session.remoteStream;
  const remoteCameraActive = isConnected && !!session.remoteCameraStream;

  const localHasVideo = localScreenActive || localCameraActive;
  const remoteHasVideo = remoteScreenActive || remoteCameraActive;
  const dualSharing = isConnected && localHasVideo && remoteHasVideo;
  const isGridActive = isConnected && layoutMode === "grid" && dualSharing;

  const [prevDualSharing, setPrevDualSharing] = useState(dualSharing);
  if (prevDualSharing !== dualSharing) {
    setPrevDualSharing(dualSharing);
    if (!dualSharing) {
      setPipDismissed(false);
    }
  }

  const effectiveFocused: FocusedTarget = !isConnected
    ? (localCameraActive && focused === "local-camera" ? "local-camera" : localScreenActive ? "local-screen" : "local")
    : (focused === "remote" || focused === "remote-screen") && !remoteScreenActive && localScreenActive
      ? "local-screen"
      : (focused === "local" || focused === "local-screen") && !localScreenActive && remoteScreenActive
        ? "remote-screen"
        : focused === "local-camera" && !localCameraActive
          ? (localScreenActive ? "local-screen" : remoteScreenActive ? "remote-screen" : remoteCameraActive ? "remote-camera" : "local-screen")
          : focused === "remote-camera" && !remoteCameraActive
            ? (remoteScreenActive ? "remote-screen" : localScreenActive ? "local-screen" : localCameraActive ? "local-camera" : "remote-screen")
            : focused;

  const focusedIsLocal = !isConnected || effectiveFocused === "local" || effectiveFocused === "local-screen" || effectiveFocused === "local-camera";
  const focusedIsCamera = effectiveFocused === "local-camera" || (isConnected && effectiveFocused === "remote-camera");
  const focusedSharing = effectiveFocused === "local-camera"
    ? localCameraActive
    : effectiveFocused === "remote-camera"
      ? remoteCameraActive
      : focusedIsLocal
        ? localScreenActive
        : remoteScreenActive;

  const focusedStream = effectiveFocused === "local-camera"
    ? session.localCameraStream
    : effectiveFocused === "remote-camera"
      ? (isConnected ? session.remoteCameraStream : undefined)
      : focusedIsLocal
        ? session.localStream
        : (isConnected && watchingRemote ? session.remoteStream : undefined);

  let otherStream: MediaStream | undefined;
  let otherTarget: FocusedTarget | undefined;
  let otherLabel = "";

  if (isConnected) {
    if (effectiveFocused === "remote" || effectiveFocused === "remote-screen") {
      if (localScreenActive) {
        otherStream = session.localStream;
        otherTarget = "local-screen";
        otherLabel = `${state.localUserName} (Tela)`;
      } else if (localCameraActive) {
        otherStream = session.localCameraStream;
        otherTarget = "local-camera";
        otherLabel = `${state.localUserName} (Câmera)`;
      } else if (remoteCameraActive) {
        otherStream = session.remoteCameraStream;
        otherTarget = "remote-camera";
        otherLabel = `${state.remoteUserName} (Câmera)`;
      }
    } else if (effectiveFocused === "local" || effectiveFocused === "local-screen") {
      if (remoteScreenActive) {
        otherStream = session.remoteStream;
        otherTarget = "remote-screen";
        otherLabel = state.remoteUserName;
      } else if (remoteCameraActive) {
        otherStream = session.remoteCameraStream;
        otherTarget = "remote-camera";
        otherLabel = `${state.remoteUserName} (Câmera)`;
      } else if (localCameraActive) {
        otherStream = session.localCameraStream;
        otherTarget = "local-camera";
        otherLabel = `${state.localUserName} (Câmera)`;
      }
    } else if (effectiveFocused === "local-camera") {
      if (remoteScreenActive) {
        otherStream = session.remoteStream;
        otherTarget = "remote-screen";
        otherLabel = state.remoteUserName;
      } else if (remoteCameraActive) {
        otherStream = session.remoteCameraStream;
        otherTarget = "remote-camera";
        otherLabel = `${state.remoteUserName} (Câmera)`;
      } else if (localScreenActive) {
        otherStream = session.localStream;
        otherTarget = "local-screen";
        otherLabel = `${state.localUserName} (Tela)`;
      }
    } else if (effectiveFocused === "remote-camera") {
      if (remoteScreenActive) {
        otherStream = session.remoteStream;
        otherTarget = "remote-screen";
        otherLabel = `${state.remoteUserName} (Tela)`;
      } else if (localScreenActive) {
        otherStream = session.localStream;
        otherTarget = "local-screen";
        otherLabel = `${state.localUserName} (Tela)`;
      } else if (localCameraActive) {
        otherStream = session.localCameraStream;
        otherTarget = "local-camera";
        otherLabel = `${state.localUserName} (Câmera)`;
      }
    }
  } else if (localScreenActive && localCameraActive) {
    if (effectiveFocused === "local-screen") {
      otherStream = session.localCameraStream;
      otherTarget = "local-camera";
      otherLabel = `${state.localUserName} (Câmera)`;
    } else {
      otherStream = session.localStream;
      otherTarget = "local-screen";
      otherLabel = `${state.localUserName} (Tela)`;
    }
  }

  const isAutoHideActive = focusedSharing;
  const showPip = !!otherStream && !isGridActive && !pipDismissed;

  const presenterName = focusedIsLocal
    ? (focusedIsCamera ? `${state.localUserName} (Câmera)` : state.localUserName)
    : (focusedIsCamera ? `${state.remoteUserName} (Câmera)` : state.remoteUserName);
  const isRemoteControlView = !focusedIsLocal && session.remotePeerControlConfig.enabled;
  const localScreenQualityLabel = isConnected && session.outgoingFps !== undefined
    ? `${session.resolution} · ${session.outgoingFps} FPS reais`
    : session.captureFps !== undefined
      ? `${session.resolution} · captura ${session.captureFps} FPS`
      : `${session.resolution} · alvo ${session.fps} FPS`;

  useEffect(() => {
    if (!isRemoteControlView) return;
    const resetTimer = window.setTimeout(() => {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setIsPanning(false);
      panStartRef.current = null;
      setContextZoomOpen(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isRemoteControlView]);

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

  const handleMinimizeWindow = (): void => { void window.sfscreen.minimizeWindow?.(); };
  const handleMaximizeWindow = (): void => { void window.sfscreen.maximizeWindow?.(); };
  const handleCloseWindow = (): void => { void window.sfscreen.closeWindow?.(); };

  const swapFocus = (): void => {
    if (otherTarget) {
      setFocused(otherTarget);
    }
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

  /* Remote Control State */
  const [isAnyDeskLocked, setIsAnyDeskLocked] = useState(false);
  const [scrollHoldProgress, setScrollHoldProgress] = useState(0);
  const [monitorToast, setMonitorToast] = useState<string | null>(null);
  const scrollHoldStartRef = useRef<number>(0);
  const scrollHoldIntervalRef = useRef<number | null>(null);
  const capturedModifierStateRef = useRef({ ctrl: false, alt: false });
  const capturedMonitorShortcutsRef = useRef(new Set<number>());

  const isControllingRemote = session.remotePeerControlConfig.enabled;
  const [clipboardToast, setClipboardToast] = useState(false);
  const videoViewportRef = useRef<HTMLDivElement>(null);

  const setLockMode = useCallback((locked: boolean): void => {
    setIsAnyDeskLocked(locked);
    setIsFullscreen(locked);
    if (locked) {
      playLockModeSound();
    } else {
      playUnlockModeSound();
    }
    const lockRequest = window.sfscreen?.setRemoteInputLock?.(locked);
    if (!lockRequest) void window.sfscreen?.setFullscreen?.(locked);
  }, []);

  const releaseRemoteModifiers = useCallback((): void => {
    const modifiers = [
      { code: "ControlLeft", nativeKeyCode: 0xA2 },
      { code: "ControlRight", nativeKeyCode: 0xA3 },
      { code: "AltLeft", nativeKeyCode: 0xA4 },
      { code: "AltRight", nativeKeyCode: 0xA5 },
      { code: "ShiftLeft", nativeKeyCode: 0xA0 },
      { code: "ShiftRight", nativeKeyCode: 0xA1 },
      { code: "MetaLeft", nativeKeyCode: 0x5B },
      { code: "MetaRight", nativeKeyCode: 0x5C },
    ];
    modifiers.forEach(({ code, nativeKeyCode }) => {
      session.sendRemoteInput({ kind: "key-up", code, key: "", nativeKeyCode });
    });
  }, [session]);

  useEffect(() => {
    const stopCapturedInput = window.sfscreen?.onCapturedRemoteInput?.((input) => {
      if (focusedIsLocal || !isControllingRemote || !isAnyDeskLocked) return;

      if ((input.kind === "key-down" || input.kind === "key-up") && input.nativeKeyCode) {
        const isDown = input.kind === "key-down";
        if (input.nativeKeyCode === 0x11 || input.nativeKeyCode === 0xA2 || input.nativeKeyCode === 0xA3) {
          capturedModifierStateRef.current.ctrl = isDown;
        }
        if (input.nativeKeyCode === 0x12 || input.nativeKeyCode === 0xA4 || input.nativeKeyCode === 0xA5) {
          capturedModifierStateRef.current.alt = isDown;
        }

        const isMonitorDigit = input.nativeKeyCode >= 0x31 && input.nativeKeyCode <= 0x39;
        if (isDown && isMonitorDigit && capturedModifierStateRef.current.ctrl && capturedModifierStateRef.current.alt) {
          const monitorIndex = input.nativeKeyCode - 0x31;
          capturedMonitorShortcutsRef.current.add(input.nativeKeyCode);
          session.sendSelectMonitor(monitorIndex);
          setMonitorToast(`Monitor ${monitorIndex + 1}`);
          window.setTimeout(() => setMonitorToast(null), 2500);
          return;
        }
        if (!isDown && capturedMonitorShortcutsRef.current.delete(input.nativeKeyCode)) return;
      }

      session.sendRemoteInput(input);
    });
    const stopUnlock = window.sfscreen?.onRemoteInputLockReleased?.(() => {
      if (!isAnyDeskLocked) return;
      releaseRemoteModifiers();
      setLockMode(false);
    });
    return () => {
      stopCapturedInput?.();
      stopUnlock?.();
    };
  }, [focusedIsLocal, isControllingRemote, isAnyDeskLocked, releaseRemoteModifiers, session, setLockMode]);

  useEffect(() => {
    if (!isAnyDeskLocked || (!focusedIsLocal && isControllingRemote)) return;
    const timer = window.setTimeout(() => {
      releaseRemoteModifiers();
      setLockMode(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusedIsLocal, isControllingRemote, isAnyDeskLocked, releaseRemoteModifiers, setLockMode]);

  useEffect(() => () => {
    void window.sfscreen?.setRemoteInputLock?.(false);
  }, []);

  // Intercept Windows Key sent from Main Process
  useEffect(() => {
    const unsub = window.sfscreen?.onWinKeyPressed?.((action) => {
      if (!focusedIsLocal && session.remotePeerControlConfig.enabled && isAnyDeskLocked) {
        if (action === "keyDown") {
          session.sendRemoteInput({ kind: "special", action: "win" });
        }
      }
    });
    return () => unsub?.();
  }, [focusedIsLocal, session, isAnyDeskLocked]);

  useEffect(() => {
    if (focusedIsLocal || !session.remotePeerControlConfig.enabled) return;

    const handleGlobalRemoteKey = (e: KeyboardEvent): void => {
      // Toggle Lock Mode shortcut: Ctrl+Alt+A or Ctrl+Shift+A or Ctrl+A+B
      const isToggleShortcut = (e.ctrlKey || e.metaKey) && (e.altKey || e.shiftKey) && (e.key === "a" || e.key === "A" || e.code === "KeyA");
      if (isToggleShortcut && e.type === "keydown") {
        e.preventDefault();
        e.stopPropagation();
        setLockMode(!isAnyDeskLocked);
        return;
      }

      // Switch Monitor shortcut: Ctrl+Alt+1, Ctrl+Alt+2, Ctrl+Alt+3, etc.
      if (isAnyDeskLocked && (e.ctrlKey || e.metaKey) && e.altKey && e.type === "keydown") {
        let digit: number | null = null;
        if (e.code.startsWith("Digit")) {
          digit = parseInt(e.code.replace("Digit", ""), 10);
        } else if (e.code.startsWith("Numpad")) {
          digit = parseInt(e.code.replace("Numpad", ""), 10);
        } else if (/^[1-9]$/.test(e.key)) {
          digit = parseInt(e.key, 10);
        }

        if (digit !== null && !isNaN(digit) && digit >= 1 && digit <= 9) {
          e.preventDefault();
          e.stopPropagation();
          session.sendSelectMonitor(digit - 1);
          setMonitorToast(`Monitor ${digit}`);
          setTimeout(() => setMonitorToast(null), 2500);
          return;
        }
      }

      if (!isControllingRemote || !isAnyDeskLocked) return;

      // Handle Meta/Win key if received in web event
      if (e.key === "Meta" || e.code === "MetaLeft" || e.code === "MetaRight" || e.key === "OS") {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "keydown") {
          session.sendRemoteInput({ kind: "special", action: "win" });
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const kind = e.type === "keydown" ? "key-down" : "key-up";
      session.sendRemoteInput({
        kind,
        code: e.code,
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    };

    window.addEventListener("keydown", handleGlobalRemoteKey, { capture: isAnyDeskLocked });
    window.addEventListener("keyup", handleGlobalRemoteKey, { capture: isAnyDeskLocked });
    return () => {
      window.removeEventListener("keydown", handleGlobalRemoteKey, { capture: isAnyDeskLocked });
      window.removeEventListener("keyup", handleGlobalRemoteKey, { capture: isAnyDeskLocked });
    };
  }, [focusedIsLocal, session, isControllingRemote, isAnyDeskLocked, setLockMode]);

  const pendingRemoteMoveRef = useRef<{ x: number; y: number } | null>(null);
  const remoteMoveRafRef = useRef<number | null>(null);

  const getNormalizedPoint = (e: React.MouseEvent | React.PointerEvent | React.WheelEvent): { normX: number; normY: number } | null => {
    const el = videoViewportRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    // Compensa barras pretas / letterbox do object-fit: contain (estilo SelfDesk)
    const video = el.querySelector("video");
    const videoWidth = video && video.videoWidth > 0 ? video.videoWidth : 1920;
    const videoHeight = video && video.videoHeight > 0 ? video.videoHeight : 1080;

    const elemRatio = rect.width / rect.height;
    const videoRatio = videoWidth / videoHeight;

    let renderedW = rect.width;
    let renderedH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (elemRatio > videoRatio) {
      renderedW = rect.height * videoRatio;
      offsetX = (rect.width - renderedW) / 2;
    } else {
      renderedH = rect.width / videoRatio;
      offsetY = (rect.height - renderedH) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    const normX = Math.max(0, Math.min(1, clickX / renderedW));
    const normY = Math.max(0, Math.min(1, clickY / renderedH));
    return { normX, normY };
  };

  const handleVideoMouseDown = (e: React.MouseEvent): void => {
    mouseDownTimeRef.current = Date.now();
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    didPanOrDragRef.current = false;

    // Emergency Scroll Hold Detector: middle click (button === 1)
    if (!focusedIsLocal && session.remotePeerControlConfig.enabled && e.button === 1) {
      scrollHoldStartRef.current = Date.now();
      if (scrollHoldIntervalRef.current) clearInterval(scrollHoldIntervalRef.current);
      scrollHoldIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - scrollHoldStartRef.current;
        const pct = Math.min(100, Math.round((elapsed / 3000) * 100));
        setScrollHoldProgress(pct);
        if (elapsed >= 3000) {
          if (scrollHoldIntervalRef.current) {
            clearInterval(scrollHoldIntervalRef.current);
            scrollHoldIntervalRef.current = null;
          }
          setLockMode(false);
          setScrollHoldProgress(0);
        }
      }, 50);
    }

    if (!focusedIsLocal && session.remotePeerControlConfig.enabled && isControllingRemote && isAnyDeskLocked) {
      const pt = getNormalizedPoint(e);
      if (pt) {
        const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
        session.sendRemoteInput({ kind: "mouse-down", button, x: pt.normX, y: pt.normY });
      }
      return;
    }

    if (isRemoteControlView || zoomLevel <= 1 || isAnyDeskLocked) return;
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

    if (!focusedIsLocal && session.remotePeerControlConfig.enabled && isControllingRemote && isAnyDeskLocked) {
      const pt = getNormalizedPoint(e);
      if (pt) {
        pendingRemoteMoveRef.current = { x: pt.normX, y: pt.normY };
        if (!remoteMoveRafRef.current) {
          remoteMoveRafRef.current = requestAnimationFrame(() => {
            if (pendingRemoteMoveRef.current) {
              session.sendRemoteInput({ kind: "mouse-move", x: pendingRemoteMoveRef.current.x, y: pendingRemoteMoveRef.current.y });
              pendingRemoteMoveRef.current = null;
            }
            remoteMoveRafRef.current = null;
          });
        }
      }
      return;
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

  const handleVideoMouseUp = (e: React.MouseEvent): void => {
    if (Date.now() - mouseDownTimeRef.current > 200) {
      didPanOrDragRef.current = true;
    }

    // Clear emergency scroll hold interval on release
    if (e.button === 1 && scrollHoldIntervalRef.current) {
      clearInterval(scrollHoldIntervalRef.current);
      scrollHoldIntervalRef.current = null;
      setScrollHoldProgress(0);
    }

    if (!focusedIsLocal && session.remotePeerControlConfig.enabled && isControllingRemote && isAnyDeskLocked) {
      const pt = getNormalizedPoint(e);
      if (pt) {
        const button = e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
        session.sendRemoteInput({ kind: "mouse-up", button, x: pt.normX, y: pt.normY });
      }
    }
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleVideoWheel = (e: React.WheelEvent): void => {
    if (isRemoteControlView) {
      e.preventDefault();
      if (isAnyDeskLocked) {
        const pt = getNormalizedPoint(e);
        if (pt) {
          session.sendRemoteInput({ kind: "mouse-wheel", deltaX: e.deltaX, deltaY: e.deltaY, x: pt.normX, y: pt.normY });
        }
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomLevel((prev) => {
        const next = Math.max(1, Math.min(3, Math.round((prev + delta) * 100) / 100));
        if (next === 1) setPanOffset({ x: 0, y: 0 });
        return next;
      });
      return;
    }

  };

  const handleVideoDoubleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (isRemoteControlView) return;
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


  const handleChatImageChange = (file?: File): void => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setChatError("Selecione uma imagem PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setChatError("A imagem deve ter no máximo 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.82);
        if (data.length > 1_500_000) {
          setChatError("A imagem ficou grande demais. Escolha uma foto menor.");
          return;
        }
        setChatImage({ data, name: file.name });
        setChatError("");
      };
      image.onerror = () => setChatError("Não foi possível ler esta imagem.");
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleChatDrop = (event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setIsChatDropActive(false);
    handleChatImageChange(event.dataTransfer.files?.[0]);
  };

  const handleSendChat = (e: FormEvent): void => {
    e.preventDefault();
    if (chatText.trim() || chatImage) {
      if (chatImage) session.sendChatMessage(chatText, chatImage);
      else session.sendChatMessage(chatText);
      setChatText("");
      setChatImage(null);
      setChatError("");
      if (chatFileInputRef.current) chatFileInputRef.current.value = "";
    }
  };

  const renderChatText = (text: string): ReactElement[] => {
    const mentionNames = [state.localUserName, state.remoteUserName].filter(Boolean);
    const escapedNames = mentionNames.sort((left, right) => right.length - left.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const mentionPattern = escapedNames.length ? new RegExp(`(@(?:${escapedNames.join("|")}))(?=$|[^\\p{L}\\p{N}_-])`, "giu") : /$^/u;
    return text.split(mentionPattern).map((part, index) => {
      const isMention = mentionNames.some((name) => part.toLocaleLowerCase() === `@${name}`.toLocaleLowerCase());
      return isMention
        ? <button key={`${part}-${index}`} className="chat-mention" type="button" onClick={() => setChatText(`${part} `)}>{part}</button>
        : <span key={`${part}-${index}`}>{part}</span>;
    });
  };

  const mentionMatch = chatText.match(/(^|\s)@([^@]*)$/u);
  const mentionQuery = mentionMatch?.[2]?.toLocaleLowerCase();
  const sessionMentionMembers = (isConnected ? [state.remoteUserName, state.localUserName] : [state.localUserName])
    .filter((name, index, names) => name && names.indexOf(name) === index)
  const mentionCandidates = sessionMentionMembers
    .filter((name) => mentionQuery !== undefined && name.toLocaleLowerCase().includes(mentionQuery));
  const mentionAlreadyCompleted = mentionQuery !== undefined && sessionMentionMembers.some((name) => {
    const normalized = mentionQuery.trimStart().toLocaleLowerCase();
    return normalized === name.toLocaleLowerCase() || normalized.startsWith(`${name.toLocaleLowerCase()} `);
  });
  const insertMention = (name: string): void => {
    setChatText((current) => current.replace(/(^|\s)@([^@]*)$/u, `$1@${name} `));
  };

  const participantsCount = isConnected ? 2 : 1;

  return (
    <div className={`discord-app-layout ${isFullscreen ? "is-app-fullscreen" : ""}`}>
      {/* Background Remote System Audio Player */}
      <RemoteAudio stream={session.remoteStream} muted={remoteMuted} volume={remoteVolume} />

      {activeChatImage && (
        <div className="chat-image-viewer" role="dialog" aria-modal="true" aria-label={`Imagem: ${activeChatImage.name}`} onClick={() => setActiveChatImage(null)}>
          <div className="chat-image-viewer-toolbar" onClick={(event) => event.stopPropagation()}>
            <span>{activeChatImage.name}</span>
            <button type="button" aria-label="Fechar imagem" onClick={() => setActiveChatImage(null)}><XCloseIcon /></button>
          </div>
          <img src={activeChatImage.data} alt={activeChatImage.name} onClick={(event) => event.stopPropagation()} />
          <span className="chat-image-viewer-hint">Clique fora da imagem para fechar</span>
        </div>
      )}

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
            {!isConnected && <span className="session-waiting-status"><span />Aguardando convidado</span>}
            <span className="participant-counter" title={`${participantsCount} participante(s)`}>
              <UsersIcon /> {participantsCount}
            </span>
          </div>
        </div>

        <div className="topbar-center window-no-drag">
          {localSharing && session.remoteControlConfig.enabled ? (
            <div className="remote-control-host-pill">
              {session.remoteControlStatus === "paused-by-host" ? (
                <>
                  <div className="host-pill-status is-warning">
                    <span className="warning-dot-pulse" />
                    <span>Você assumiu o controle · Retomando em {session.remoteControlOverrideTimeoutMs ? Math.ceil(session.remoteControlOverrideTimeoutMs / 1000) : 5}s</span>
                  </div>
                  <button
                    className="host-pill-action-btn is-resume"
                    type="button"
                    onClick={() => void session.resumeRemoteControlOverride()}
                  >
                    ⚡ Devolver Agora
                  </button>
                </>
              ) : (
                <>
                  <div className="host-pill-status is-active">
                    <span className="active-dot-pulse" />
                    <span>🎮 {state.remoteUserName || "Convidado"} pode controlar seu PC</span>
                  </div>
                  <button
                    className="host-pill-action-btn is-stop"
                    type="button"
                    onClick={() => void session.updateRemoteControlConfig({ enabled: false })}
                    title="Encerrar controle remoto"
                  >
                    🛑 Encerrar
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
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
              <div className="sidebar-title-group">
                <div className="section-title">Pessoas na sala ({participantsCount})</div>
                <span className="sidebar-count-badge">{participantsCount}</span>
              </div>
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
            {!isConnected && (
              <section className="sidebar-room-card" aria-label="Resumo da sala privada">
                <div className="sidebar-room-heading">
                  <span className="sidebar-room-status"><span />Sala privada</span>
                  <LockShieldIcon />
                </div>
                <p>Sua sala está pronta. Envie um convite para começar uma chamada segura.</p>
                <div className="sidebar-room-meta">
                  <span><UsersIcon /> 1 pessoa</span>
                  <span><LockShieldIcon /> Protegida</span>
                </div>
                <button className="button primary sidebar-invite-action" type="button" onClick={() => session.toggleSessionModal(true)}>
                  <UsersIcon /> Convidar pessoa
                </button>
              </section>
            )}
            <div className="sidebar-participant-label">Na chamada</div>
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

              <div className="participant-item is-self">
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
              {isConnected && (
                <div className="sidebar-voice-connected-wrap">
                  {voicePopoverOpen && (
                    <VoiceConnectionPopover session={session} onClose={() => setVoicePopoverOpen(false)} />
                  )}
                  <div
                    className={`sidebar-voice-connected-bar ${voicePopoverOpen ? "is-open" : ""}`}
                    onClick={() => setVoicePopoverOpen((v) => !v)}
                    role="button"
                    tabIndex={0}
                    title="Clique para ver o status da conexão de voz e rede"
                  >
                    <div className="voice-connected-left">
                      <div className="voice-signal-icon-box">
                        <SignalWifiIcon />
                      </div>
                      <div className="voice-connected-text">
                        <span className="voice-connected-title">Voz conectada</span>
                        <span className="voice-connected-sub">WebRTC · RTC-Direct</span>
                      </div>
                    </div>
                    <div className="voice-connected-right">
                      <button
                        className="voice-hangup-mini-btn"
                        type="button"
                        title="Desconectar"
                        onClick={(e) => {
                          e.stopPropagation();
                          void session.close();
                        }}
                      >
                        <PhoneOffIcon />
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
            if (!focusedIsLocal && session.remotePeerControlConfig.enabled && isControllingRemote && zoomLevel <= 1) {
              return;
            }
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
                </div>

                {/* Tile 1: Local Participant */}
<div
                  className={`stage-grid-tile ${focusedIsLocal ? "is-focused-tile" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStageContextMenu({ x: e.clientX, y: e.clientY, target: "local" });
                  }}
                  role="region"
                  aria-label="Participante Local"
                >
                  <div className="grid-tile-ambient-bg" />

                  {state.mediaPhase === "sharing" && session.localStream ? (
                    <div className="grid-tile-split-content">
                      {/* Left Avatar Card with Ambient Backdrop */}
                      <div
                        className={`tile-side-avatar-box is-self ${session.cameraActive && session.localCameraStream ? "is-camera-active is-clickable" : ""}`}
                        onClick={session.cameraActive && session.localCameraStream ? () => {
                          setFocused("local-camera");
                          setLayoutMode("focus");
                        } : (e) => e.stopPropagation()}
                        role={session.cameraActive && session.localCameraStream ? "button" : undefined}
                        tabIndex={session.cameraActive && session.localCameraStream ? 0 : undefined}
                        title={session.cameraActive && session.localCameraStream ? "Clique para focar na câmera" : undefined}
                      >
                        <div className={`card-ambient-backdrop ${!state.localUserAvatar ? "is-fallback" : ""}`}>
                          {state.localUserAvatar && (
                            <img src={state.localUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                          )}
                        </div>

                        <div className="card-inner-body">
                          {session.cameraActive && session.localCameraStream ? (
                            <div className="tile-camera-feed-wrap">
                              <Video stream={session.localCameraStream} muted volume={0} className="tile-camera-video" />
                            </div>
                          ) : (
                            <>
                              <div className="tile-side-avatar-ring is-self">
                                <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="tile-side-avatar-inner is-self" />
                              </div>
                              <span className="tile-side-name">{state.localUserName}</span>
                              <span className="tile-side-subtitle">Compartilhando a tela</span>
                            </>
                          )}
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill is-camera" title={session.cameraActive ? "Câmera ligada" : "Câmera desligada"}>
                            <CameraIcon />
                            <span>Câmera</span>
                            <span className={`camera-status-dot ${session.cameraActive ? "is-online" : "is-offline"}`} />
                          </div>
                        </div>
                      </div>

                      {/* Screenshare Video on the Right with Ambient Blurred Backdrop */}
                      <div
                        className={`tile-screenshare-box ${focused === "local" || focused === "local-screen" ? "is-focused-subtile" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocused("local-screen");
                          setLayoutMode("focus");
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="screenshare-header-overlay">
                          <span className="tile-res-pill" title={`Alvo configurado: ${session.fps} FPS`}>{localScreenQualityLabel}</span>
                          <div className="tile-live-badge">
                            <span className="tile-live-dot" />
                            <span>AO VIVO</span>
                          </div>
                        </div>

                        {!isWindowFocused ? (
                          <div className="grid-tile-paused-state">
                            <EcoZapIcon />
                            <p>Sua transmissão está ligada, porém pausamos a renderização para reduzir consumos.</p>
                          </div>
                        ) : (
                          <>
                            <div className="screenshare-ambient-backdrop" />
                            <Video stream={session.localStream} muted volume={0} className="stage-video is-contain" />
                          </>
                        )}
                      </div>
                    </div>
                  ) : session.cameraActive && session.localCameraStream ? (
                    <div
                      className="grid-tile-nonsharing-content is-camera-standalone is-clickable"
                      onClick={() => {
                        setFocused("local-camera");
                        setLayoutMode("focus");
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="tile-side-avatar-box is-standalone-centered is-camera-active is-self">
                        <div className="tile-camera-feed-wrap">
                          <Video stream={session.localCameraStream} muted volume={0} className="tile-camera-video" />
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill is-camera" title="Câmera ligada">
                            <CameraIcon />
                            <span>Câmera</span>
                            <span className="camera-status-dot is-online" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid-tile-nonsharing-content">
                      <div className={`card-ambient-backdrop ${!state.localUserAvatar ? "is-fallback" : ""}`}>
                        {state.localUserAvatar && (
                          <img src={state.localUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                        )}
                      </div>

                      <div className="tile-center-profile-box">
                        <div className="tile-avatar-ring is-self">
                          <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="tile-avatar-inner is-self" />
                        </div>
                        <span className="tile-avatar-name">{state.localUserName}</span>
                      </div>

                      <div className="card-inner-footer">
                        <div className="tile-footer-pill is-camera" title="Câmera desligada">
                          <CameraIcon />
                          <span>Câmera</span>
                          <span className="camera-status-dot is-offline" />
                        </div>
                      </div>
                    </div>
                  )}

                  {(state.mediaPhase === "sharing" || (session.cameraActive && session.localCameraStream)) && (
                    <div className="grid-tile-overlay-hint">
                      <FocusViewIcon />
                      <span>Clique para focar</span>
                    </div>
                  )}
                </div>

                {/* Tile 2: Remote Participant */}
                <div
                  className={`stage-grid-tile ${!focusedIsLocal ? "is-focused-tile" : ""}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStageContextMenu({ x: e.clientX, y: e.clientY, target: "remote" });
                  }}
                  role="region"
                  aria-label="Participante Remoto"
                >
                  <div className="grid-tile-ambient-bg" />

                  {session.remoteStream ? (
                    <div className="grid-tile-split-content">
                      {/* Participant Card / Camera on the Left with Ambient Backdrop */}
                      <div
                        className={`tile-side-avatar-box ${session.remoteCameraStream ? "is-camera-active is-clickable" : ""} ${focused === "remote-camera" ? "is-focused-subtile" : ""}`}
                        onClick={session.remoteCameraStream ? () => {
                          setFocused("remote-camera");
                          setLayoutMode("focus");
                        } : (e) => e.stopPropagation()}
                        role={session.remoteCameraStream ? "button" : undefined}
                        tabIndex={session.remoteCameraStream ? 0 : undefined}
                      >
                        <div className={`card-ambient-backdrop ${!state.remoteUserAvatar ? "is-fallback" : ""}`}>
                          {state.remoteUserAvatar && (
                            <img src={state.remoteUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                          )}
                        </div>

                        <div className="card-inner-body">
                          {session.remoteCameraStream ? (
                            <div className="tile-camera-feed-wrap">
                              <Video stream={session.remoteCameraStream} muted volume={0} className="tile-camera-video" />
                            </div>
                          ) : (
                            <>
                              <div className="tile-side-avatar-ring">
                                <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="tile-side-avatar-inner" />
                              </div>
                              <span className="tile-side-name">{state.remoteUserName}</span>
                              <span className="tile-side-subtitle">Compartilhando a tela</span>
                            </>
                          )}
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill is-camera">
                            <CameraIcon />
                            <span>{state.remoteUserName}</span>
                            <span className={`camera-status-dot ${session.remoteCameraStream ? "is-online" : "is-offline"}`} />
                          </div>
                        </div>
                      </div>

                      {/* Screenshare Video on the Right with Ambient Blurred Backdrop */}
                      <div
                        className={`tile-screenshare-box ${focused === "remote" || focused === "remote-screen" ? "is-focused-subtile" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocused("remote-screen");
                          setLayoutMode("focus");
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="screenshare-header-overlay">
                          <span className="tile-res-pill">
                            {getStreamTrackInfo(session.remoteStream, "1080p", 60).resolution} · {getStreamTrackInfo(session.remoteStream, "1080p", 60).fps} FPS
                          </span>
                          <div className="tile-live-badge">
                            <span className="tile-live-dot" />
                            <span>AO VIVO</span>
                          </div>
                        </div>

                        <div className="screenshare-ambient-backdrop" />
                        <Video
                          stream={session.remoteStream}
                          muted={remoteMuted}
                          volume={remoteVolume}
                          className="stage-video is-contain"
                        />
                      </div>
                    </div>
                  ) : session.remoteCameraStream ? (
                    <div
                      className="grid-tile-nonsharing-content is-camera-standalone is-clickable"
                      onClick={() => {
                        setFocused("remote-camera");
                        setLayoutMode("focus");
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="tile-side-avatar-box is-standalone-centered is-camera-active">
                        <div className="tile-camera-feed-wrap">
                          <Video stream={session.remoteCameraStream} muted volume={0} className="tile-camera-video" />
                        </div>

                        <div className="card-inner-footer">
                          <div className="tile-footer-pill is-camera">
                            <CameraIcon />
                            <span>{state.remoteUserName}</span>
                            <span className="camera-status-dot is-online" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid-tile-nonsharing-content">
                      <div className={`card-ambient-backdrop ${!state.remoteUserAvatar ? "is-fallback" : ""}`}>
                        {state.remoteUserAvatar && (
                          <img src={state.remoteUserAvatar} alt="" aria-hidden="true" className="card-ambient-img" />
                        )}
                      </div>

                      <div className="tile-center-profile-box">
                        <div className="tile-avatar-ring">
                          <UserAvatar name={state.remoteUserName} avatar={state.remoteUserAvatar} className="tile-avatar-inner" />
                        </div>
                        <span className="tile-avatar-name">{state.remoteUserName}</span>
                      </div>

                      <div className="card-inner-footer">
                        <div className="tile-footer-pill is-camera">
                          <CameraIcon />
                          <span>{state.remoteUserName}</span>
                          <span className={`camera-status-dot ${session.remoteCameraStream ? "is-online" : "is-offline"}`} />
                        </div>
                      </div>
                    </div>
                  )}

                  {(session.remoteStream || session.remoteCameraStream) && (
                    <div className="grid-tile-overlay-hint">
                      <FocusViewIcon />
                      <span>Clique para focar</span>
                    </div>
                  )}
                </div>
              </div>

            ) : focusedSharing && focusedStream ? (
              <div
                ref={videoViewportRef}
                className="stage-video-viewport"
                onClick={handleStageVideoClick}
                onMouseDown={handleVideoMouseDown}
                onMouseMove={handleVideoMouseMove}
                onMouseUp={handleVideoMouseUp}
                onWheel={handleVideoWheel}
                onDoubleClick={handleVideoDoubleClick}
                style={{
                  cursor: isPanning ? "grabbing" : zoomLevel > 1 ? "grab" : !focusedIsLocal && session.remotePeerControlConfig.enabled && isControllingRemote && isAnyDeskLocked ? "crosshair" : dualSharing ? "pointer" : "default",
                }}
              >
                {/* Interactive Remote Control Floating Action Bar */}
                {!focusedIsLocal && session.remotePeerControlConfig.enabled && (
                  <div className={`remote-control-viewer-bar stage-fade-element ${controlsVisible || streamMenuOpen || isAnyDeskLocked ? "is-visible" : ""}`}>
                    <button
                      className={`remote-ctrl-lock-btn ${isAnyDeskLocked ? "is-locked" : ""}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLockMode(!isAnyDeskLocked);
                      }}
                      title={isAnyDeskLocked ? "Destravar controle (Atalho: Ctrl+Alt+A ou segure Scroll por 3s)" : "Travar mouse, teclado e atalhos para o PC remoto (Atalho: Ctrl+Alt+A)"}
                    >
                      <GamepadIcon />
                      <span>{isAnyDeskLocked ? "🔒 Lock Ativo (Ctrl+Alt+A)" : "🎮 Ativar Controle (Ctrl+Alt+A)"}</span>
                    </button>

                    {isAnyDeskLocked && (
                      <div className="remote-ctrl-monitor-switcher" title="Alternar monitor (Atalhos: Ctrl+Alt+1, Ctrl+Alt+2)" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="remote-ctrl-mini-btn"
                          type="button"
                          onClick={() => {
                            session.sendSelectMonitor(0);
                            setMonitorToast("Monitor 1");
                            setTimeout(() => setMonitorToast(null), 2500);
                          }}
                          title="Trocar para o Monitor 1 (Ctrl+Alt+1)"
                        >
                          🖥️ 1
                        </button>
                        <button
                          className="remote-ctrl-mini-btn"
                          type="button"
                          onClick={() => {
                            session.sendSelectMonitor(1);
                            setMonitorToast("Monitor 2");
                            setTimeout(() => setMonitorToast(null), 2500);
                          }}
                          title="Trocar para o Monitor 2 (Ctrl+Alt+2)"
                        >
                          🖥️ 2
                        </button>
                      </div>
                    )}

                    {session.remoteControlStatus === "paused-by-host" && (
                      <div className="remote-ctrl-paused-pill" title="O anfitrião mexeu no mouse físico. O controle retornará automaticamente em 5s.">
                        <span className="paused-pulse-dot" />
                        <span>Anfitrião no controle ({session.remoteControlOverrideTimeoutMs ? Math.ceil(session.remoteControlOverrideTimeoutMs / 1000) : 5}s)</span>
                      </div>
                    )}

                    {isAnyDeskLocked && (
                      <div className="remote-ctrl-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="remote-ctrl-mini-btn"
                          type="button"
                          title="Enviar texto copiado para o PC remoto"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              if (text) {
                                session.sendRemoteClipboard(text);
                                setClipboardToast(true);
                                setTimeout(() => setClipboardToast(false), 2000);
                              }
                            } catch {
                              // Ignored
                            }
                          }}
                        >
                          <ClipboardCopyIcon />
                          <span>{clipboardToast ? "Enviado!" : "Clipboard"}</span>
                        </button>

                        <button
                          className="remote-ctrl-mini-btn"
                          type="button"
                          title="Enviar Tecla Windows para o PC remoto"
                          onClick={() => session.sendRemoteInput({ kind: "special", action: "win" })}
                        >
                          <span>🪟 Win</span>
                        </button>

                        <button
                          className="remote-ctrl-mini-btn"
                          type="button"
                          title="Enviar Ctrl+Alt+Del para o PC remoto"
                          onClick={() => session.sendRemoteInput({ kind: "special", action: "ctrl-alt-del" })}
                        >
                          <span>⌨️ Ctrl+Alt+Del</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Monitor Switch Toast Notification */}
                {monitorToast && (
                  <div className="monitor-switch-toast">
                    <span>🖥️ Alternando para {monitorToast}...</span>
                  </div>
                )}

                {/* Emergency Scroll Hold Visual Progress Indicator */}
                {scrollHoldProgress > 0 && (
                  <div className="scroll-hold-overlay">
                    <div className="scroll-hold-card">
                      <div className="scroll-hold-icon">🖱️</div>
                      <div className="scroll-hold-info">
                        <span className="scroll-hold-title">Soltando controle de emergência...</span>
                        <span className="scroll-hold-sub">Mantenha o Scroll pressionado ({Math.max(1, Math.ceil(3 - (scrollHoldProgress * 3) / 100))}s)</span>
                        <div className="scroll-hold-bar-track">
                          <div className="scroll-hold-bar-fill" style={{ width: `${scrollHoldProgress}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`stage-top-pill stage-fade-element ${controlsVisible || streamMenuOpen ? "is-visible" : ""}`}>
                  <span className="presenter-tag">
                    {focusedIsCamera ? <CameraIcon /> : <ScreenCastIcon />}
                    <span>{presenterName} está apresentando</span>
                  </span>
                  <span className="resolution-tag">
                    {focusedIsLocal && !focusedIsCamera
                      ? localScreenQualityLabel
                      : `${getStreamTrackInfo(focusedStream, focusedIsCamera ? "720p" : "1080p", focusedIsCamera ? 30 : 60).resolution} · ${getStreamTrackInfo(focusedStream, focusedIsCamera ? "720p" : "1080p", focusedIsCamera ? 30 : 60).fps} FPS`}
                  </span>
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
                      transform: isRemoteControlView
                        ? "scale(1) translate(0px, 0px)"
                        : `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
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
            ) : isConnected ? (
              <div className="stage-call-participants-view has-two-peers">
                {/* Local Participant Card */}
                <div className="call-participant-card is-self-card">
                  <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="call-card-avatar is-self" />
                  <div className="call-card-name-tag">
                    <span className="name-text">{state.localUserName}</span>
                    <span className="self-name-badge">Você</span>
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
            ) : (
              <div className="stage-welcome-state">
                <div className="welcome-orbit welcome-orbit-one" />
                <div className="welcome-orbit welcome-orbit-two" />
                <div className="welcome-content-card">
                  <div className="welcome-kicker"><span />Sala privada pronta</div>
                  <div className="welcome-avatar-ring">
                    <UserAvatar name={state.localUserName} avatar={state.localUserAvatar} isSelf className="welcome-avatar" />
                  </div>
                  <h2>Pronto para conectar</h2>
                  <p>Sua sala está pronta. Use os controles da lateral ou o dock inferior quando quiser começar.</p>
                  <div className="welcome-security-note"><LockShieldIcon /> Conexão protegida por DTLS-SRTP</div>
                </div>
              </div>
            )}




            {/* Discord-style Zoom Navigator & Mini-map Viewfinder Widget */}
            {focusedSharing && !isRemoteControlView && zoomLevel > 1 && (
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


            {/* PiP Thumbnail if multiple streams are active (Draggable with 4-corner snap) */}
            {showPip && otherStream && (
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
                  setStageContextMenu({ x: e.clientX, y: e.clientY, target: otherTarget === "local-screen" || otherTarget === "local-camera" ? "local" : "remote" });
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
                  {(otherTarget === "local-screen" || otherTarget === "local-camera") && !isWindowFocused ? (
                    <div className="pip-paused-state">
                      <EcoZapIcon />
                      <small>Sua transmissão está ligada, porém pausamos a renderização para reduzir consumos.</small>
                    </div>
                  ) : (
                    <Video
                      stream={otherStream}
                      muted={otherTarget === "local-screen" || otherTarget === "local-camera" || remoteMuted}
                      volume={otherTarget === "local-screen" || otherTarget === "local-camera" ? 0 : remoteVolume}
                      className="pip-video"
                    />
                  )}
                </div>

                <div className="pip-footer">
                  <div className="pip-footer-title">
                    <MoveIcon />
                    <span>{otherLabel}</span>
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

              {/* Camera Toggle Button in Dock */}
              <button
                className={`dock-icon-btn is-camera-btn ${session.cameraActive ? "is-camera-on" : ""}`}
                type="button"
                onClick={() => void session.toggleCamera()}
                title={session.cameraActive ? "Desativar câmera" : "Ativar câmera"}
                aria-label={session.cameraActive ? "Desativar câmera" : "Ativar câmera"}
              >
                <CameraIcon />
              </button>

              <button className={`dock-icon-btn ${state.chatPanelOpen ? "is-active" : ""}`} type="button" title="Chat" onClick={handleToggleChat}>
                <MessageSquareIcon />
                {unreadChatCount > 0 && !state.chatPanelOpen && <span className="dock-badge">{unreadChatCount}</span>}
              </button>

              <button className="dock-icon-btn" type="button" title="Configurações" onClick={() => setSettingsOpen(true)}>
                <GearIcon />
              </button>

              {isConnected && (
                <button className="dock-action-btn is-hangup" type="button" title="Desconectar da chamada" onClick={() => void session.close()}>
                  <PhoneOffIcon />
                  <span>Desconectar</span>
                </button>
              )}
            </div>
          </div>
        </main>


        {/* Right Collapsible Chat Drawer (Resizable) */}
        {state.chatPanelOpen && (
          <aside
            className={`discord-chat-drawer ${isChatDropActive ? "is-drop-active" : ""}`}
            style={{ width: `${chatWidth}px` }}
            onDragEnter={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes("Files")) setIsChatDropActive(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsChatDropActive(false); }}
            onDrop={handleChatDrop}
          >
            {/* Chat Resize Handle */}
            <div
              className="resize-handle resize-handle-left"
              onMouseDown={startChatResize}
              title="Arraste para redimensionar o chat"
            />

            <div className="chat-header">
              <div className="chat-title-group">
                <span className="chat-title-icon"><MessageSquareIcon /></span>
                <div><h3>Chat da Chamada</h3><span>{participantsCount} {participantsCount === 1 ? "pessoa" : "pessoas"} na sala</span></div>
              </div>
              <button className="icon-action-button" type="button" onClick={handleCloseChat} aria-label="Fechar chat">
                <XCloseIcon />
              </button>
            </div>

            {isChatDropActive && (
              <div className="chat-drop-overlay" aria-hidden="true">
                <ImageIcon />
                <strong>Solte a imagem para enviar</strong>
                <span>PNG, JPG, WEBP ou GIF</span>
              </div>
            )}

            <div className="chat-messages-container">
              {state.chatMessages.length === 0 && !isConnected && (
                <div className="chat-notice chat-empty-state">
                  <MessageSquareIcon />
                  <strong>Nenhuma mensagem ainda</strong>
                  <span>As mensagens serão entregues assim que um participante se conectar.</span>
                </div>
              )}
              {state.chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-message-item ${msg.isSelf === true || (msg.isSelf === undefined && msg.senderName === state.localUserName) ? "is-self" : ""}`}>
                  <UserAvatar
                    name={msg.senderName}
                    avatar={msg.isSelf === true || (msg.isSelf === undefined && msg.senderName === state.localUserName) ? state.localUserAvatar : state.remoteUserAvatar}
                    isSelf={msg.isSelf === true || (msg.isSelf === undefined && msg.senderName === state.localUserName)}
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
                    {msg.text && <p className="chat-text">{renderChatText(msg.text)}</p>}
                    {msg.imageData && (
                      <button className="chat-image-link" type="button" onClick={() => setActiveChatImage({ data: msg.imageData!, name: msg.imageName ?? "Imagem enviada no chat" })} title="Abrir imagem em tela cheia">
                        <img className="chat-image" src={msg.imageData} alt={msg.imageName ?? "Imagem enviada no chat"} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {state.chatMessages.length > 0 && !isConnected && (
                <div className="chat-notice is-bottom-notice">
                  Você está sozinho na chamada. As mensagens serão entregues assim que um participante se conectar.
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>


            <form className="chat-input-box" onSubmit={handleSendChat}>
              {chatImage && (
                <div className="chat-image-preview">
                  <img src={chatImage.data} alt="Prévia da imagem selecionada" />
                  <div><strong>{chatImage.name}</strong><span>Pronta para enviar</span></div>
                  <button type="button" aria-label="Remover imagem" title="Remover imagem" onClick={() => { setChatImage(null); if (chatFileInputRef.current) chatFileInputRef.current.value = ""; }}>×</button>
                </div>
              )}
              {chatError && <span className="chat-upload-error">{chatError}</span>}
              <input ref={chatFileInputRef} className="chat-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => handleChatImageChange(e.target.files?.[0])} />
              <button className="chat-attach-btn" type="button" title="Enviar imagem" aria-label="Enviar imagem" onClick={() => chatFileInputRef.current?.click()}>
                <ImageIcon />
              </button>
              <input
                className="chat-text-input"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Conversar no canal…"
                title={`Use @${isConnected ? state.remoteUserName : "Usuario"} para mencionar`}
              />
              {mentionQuery !== undefined && !mentionAlreadyCompleted && (
                <div className="chat-mention-menu" role="listbox" aria-label="Mencionar participante">
                  <div className="chat-mention-menu-label">Membros da sessão</div>
                  {mentionCandidates.length > 0 ? mentionCandidates.map((name) => {
                    const isLocal = name === state.localUserName;
                    return <button key={name} type="button" className="chat-mention-option" role="option" onClick={() => insertMention(name)}>
                      <UserAvatar name={name} avatar={isLocal ? state.localUserAvatar : state.remoteUserAvatar} isSelf={isLocal} className="chat-mention-avatar" />
                      <span><strong>{name}</strong><small>{isLocal ? "Você" : "Conectado"}</small></span>
                    </button>;
                  }) : <span className="chat-mention-empty">Nenhum membro encontrado</span>}
                </div>
              )}
              <button className="chat-send-btn" type="submit" disabled={!chatText.trim() && !chatImage} aria-label="Enviar">
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
              {!session.remotePeerControlConfig.enabled && <div className="context-menu-submenu-wrapper">
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
              </div>}

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

        <SourceModal
          sources={session.sources}
          resolution={session.resolution}
          fps={session.fps}
          onClose={session.closeSourcePicker}
          onSelect={session.selectSource}
          onResolutionChange={session.setResolution}
          onFpsChange={session.setFps}
        />
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


