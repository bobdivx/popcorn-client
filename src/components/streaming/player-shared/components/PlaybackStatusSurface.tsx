import { useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
import { generateQRCode } from '../../../../lib/utils/qrcode';
import { pipelineHeadline, type PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';
import GpuPlaybackChip from './GpuPlaybackChip';
import {
  PLAYBACK_PHASE_I18N_KEYS,
  derivePlaybackPhase,
  type PlaybackPhase,
  type PlaybackStatsLike,
  type PlayStatusLike,
} from '../derivePlaybackPhase';

export type PlaybackStatusVariant = 'fullscreen' | 'player' | 'inline' | 'chip';

export interface PlaybackStatusDebugLog {
  id?: string | number;
  level?: string;
  message?: string;
  timestamp?: number;
  [key: string]: unknown;
}

function isSparseOrEmptyError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message.includes('SPARSE_OR_EMPTY') ||
    /sparse|fichier vide|empty file|aucune donnée téléchargée/i.test(message)
  );
}

export interface PlaybackStatusSurfaceProps {
  variant: PlaybackStatusVariant;
  playStatus?: PlayStatusLike | null;
  torrentStats?: PlaybackStatsLike | null;
  progressMessage?: string | null;
  errorMessage?: string | null;
  title?: string | null;
  /** Backdrop / hero pour le fond. */
  imageUrl?: string | null;
  /** Affiche portrait (poster TMDB) — prioritaire pour la carte média. */
  posterUrl?: string | null;
  isHlsPreparing?: boolean;
  isBuffering?: boolean;
  hasVideoFiles?: boolean;
  isActiveSession?: boolean;
  bufferedPercent?: number | null;
  showDebug?: boolean;
  debugLogs?: PlaybackStatusDebugLog[];
  /** Retour / fermer l’overlay (le téléchargement continue). */
  onCancel?: () => void;
  onContinueInBackground?: () => void;
  /** Annuler vraiment le téléchargement (retirer le torrent). */
  onAbortDownload?: () => void;
  onRetry?: () => void;
  /** Supprimer les fichiers sparses/vides (après confirmation UI). */
  onDeleteEmptyFiles?: () => void;
  onToggleDebug?: () => void;
  onCopyLogs?: () => void;
  onClearLogs?: () => void;
  cancelLabel?: string;
  className?: string;
  pipelineStatus?: PlaybackPipelineStatus | null;
  debugLogsUrl?: string | null;
}

const STEP_KEYS = ['queue', 'metadata', 'peers', 'download'] as const;

function phaseLabel(t: (k: string) => string, phase: PlaybackPhase): string {
  const key = PLAYBACK_PHASE_I18N_KEYS[phase];
  return t(key) || '';
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims =
    size === 'lg' ? 'w-16 h-16 sm:w-20 sm:h-20' : size === 'sm' ? 'w-9 h-9' : 'w-12 h-12 sm:w-14 sm:h-14';
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative ${dims} rounded-2xl border border-white/15 bg-black/40 backdrop-blur-md shadow-[0_8px_32px_rgba(220,38,38,0.25)] flex items-center justify-center overflow-hidden`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 via-transparent to-transparent" />
        <img
          src="/popcorn_logo.png"
          alt="Popcornn"
          className="relative w-[72%] h-[72%] object-contain drop-shadow-[0_0_12px_rgba(220,38,38,0.45)]"
        />
      </div>
      <span className="text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-white/70">
        Popcornn
      </span>
    </div>
  );
}

function MediaPoster({
  src,
  title,
  compact,
}: {
  src: string;
  title?: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.65)] bg-black/50 ${
        compact
          ? 'w-[4.25rem] xs:w-20 sm:w-24 landscape-compact:w-[4.5rem] aspect-[2/3]'
          : 'w-[6.5rem] sm:w-40 short:w-[5.5rem] landscape-compact:w-20 aspect-[2/3]'
      }`}
    >
      <img
        src={src}
        alt={title || ''}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/15" />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
      {/* Pastille logo Popcornn sur l’affiche */}
      <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-6 h-6 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-black/55 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
        <img src="/popcorn_logo.png" alt="" className="w-[70%] h-[70%] object-contain" />
      </div>
    </div>
  );
}

function PipelinePanel({
  status,
  debugUrl,
  bufferedPercent,
  t,
}: {
  status: PlaybackPipelineStatus | null;
  debugUrl?: string | null;
  bufferedPercent?: number | null;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const loadQr = async () => {
    if (!debugUrl) return;
    if (!qr) {
      try {
        setQr(await generateQRCode(debugUrl));
      } catch {
        /* ignore */
      }
    }
    setQrOpen(true);
  };

  const serverPct =
    status && status.expected_segments > 0
      ? Math.min(100, Math.round((status.segment_count / status.expected_segments) * 1000) / 10)
      : status?.playlist_ready
        ? 8
        : null;
  const playerPct =
    bufferedPercent != null && bufferedPercent > 0 && bufferedPercent < 100 ? bufferedPercent : null;

  return (
    <div className="w-full min-w-0 mb-4 sm:mb-5 space-y-2.5 sm:space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 landscape-compact:grid-cols-2 gap-2 min-w-0">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-left min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold mb-1">
            {t('playback.hls.serverPipeline')}
          </div>
          <div className="mb-1.5">
            <GpuPlaybackChip pipeline={status} />
          </div>
          <div className="text-xs sm:text-sm text-white/90 mb-1.5 break-words line-clamp-3">
            {pipelineHeadline(status, t)}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
              style={{ width: `${serverPct ?? 12}%` }}
            />
          </div>
          <div className="text-[11px] text-white/45 break-words line-clamp-2">
            {status
              ? `${t('playback.hls.segmentsReady', {
                  ready: status.segment_count,
                  expected: status.expected_segments || '…',
                })} · ${
                  status.mode === 'remux'
                    ? t('playback.hls.modeRemux')
                    : t('playback.hls.modeTranscode')
                } · ${
                  status.ffmpeg_running ? t('playback.hls.ffmpegRunning') : t('playback.hls.ffmpegIdle')
                }`
              : t('playback.hls.serverPreparing')}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-left min-w-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold mb-1">
            {t('playback.hls.playerBuffer')}
          </div>
          <div className="text-xs sm:text-sm text-white/90 mb-1.5 break-words line-clamp-2">
            {playerPct != null
              ? t('playback.bufferingProgress', { percent: Math.round(playerPct) })
              : t('playback.hls.playlistReady')}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-400 transition-[width] duration-500"
              style={{ width: `${playerPct ?? 4}%` }}
            />
          </div>
        </div>
      </div>
      {debugUrl ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={debugUrl}
              target="_blank"
              rel="noreferrer"
              data-focusable
              tabIndex={0}
              className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white/80"
            >
              {t('playback.hls.openLogs')}
            </a>
            <button
              type="button"
              onClick={loadQr}
              data-focusable
              tabIndex={0}
              className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white/80"
            >
              QR
            </button>
          </div>
          {qrOpen && qr ? (
            <div className="rounded-xl bg-white p-2">
              <img src={qr} alt={t('playback.hls.scanLogsQr')} className="w-32 h-32" />
              <p className="text-[10px] text-black/60 text-center mt-1 max-w-[8rem]">
                {t('playback.hls.scanLogsQr')}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 backdrop-blur-md min-w-0">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/40 font-semibold mb-0.5">
        {label}
      </div>
      <div className="text-sm sm:text-base font-semibold text-white tabular-nums truncate">{value}</div>
    </div>
  );
}

function ProgressRing({
  percent,
  spinning,
}: {
  percent: number | null;
  spinning: boolean;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = percent != null ? Math.max(0, Math.min(100, percent)) : null;
  const offset = p != null ? c * (1 - p / 100) : c * 0.82;

  return (
    <div className="relative w-[5.75rem] h-[5.75rem] xs:w-[7rem] xs:h-[7rem] sm:w-40 sm:h-40 short:w-[5.5rem] short:h-[5.5rem] landscape-compact:w-[5.25rem] landscape-compact:h-[5.25rem] mx-auto shrink-0">
      <div className="absolute inset-2 rounded-full bg-primary-600/15 blur-xl animate-pulse" />
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-primary-500 transition-[stroke-dashoffset] duration-700 ease-out"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {spinning && (
        <div className="absolute inset-[10px] rounded-full border-2 border-primary-400/25 border-t-primary-400 animate-spin" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {p != null ? (
          <span className="text-2xl sm:text-4xl short:text-xl font-bold text-white tabular-nums tracking-tight leading-none">
            {Math.round(p)}
            <span className="text-sm sm:text-lg text-primary-300">%</span>
          </span>
        ) : (
          <img
            src="/popcorn_logo.png"
            alt=""
            className="w-8 h-8 sm:w-11 sm:h-11 short:w-7 short:h-7 object-contain opacity-90 drop-shadow-[0_0_10px_rgba(220,38,38,0.4)] animate-pulse"
          />
        )}
      </div>
    </div>
  );
}

function StepRail({
  stepIndex,
  t,
}: {
  stepIndex: number;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex gap-1.5 sm:gap-2 w-full max-w-sm mx-auto mb-4 sm:mb-5 min-w-0">
      {STEP_KEYS.map((key, i) => {
        const n = i + 1;
        const done = stepIndex > n;
        const active = stepIndex === n;
        return (
          <div key={key} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={`h-1 w-full rounded-full overflow-hidden transition-colors duration-500 ${
                done ? 'bg-primary-500' : active ? 'bg-white/25' : 'bg-white/10'
              }`}
            >
              {active ? <div className="h-full w-1/2 bg-primary-400 animate-shimmer" /> : null}
            </div>
            <span
              className={`text-[9px] uppercase tracking-wider font-semibold transition-colors duration-300 ${
                active ? 'text-primary-300' : done ? 'text-white/70' : 'text-white/25'
              }`}
            >
              {t(`playback.step.${key}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Surface unique d'état lecture/téléchargement (glass).
 * Variantes: fullscreen | player | inline | chip
 */
export function PlaybackStatusSurface({
  variant,
  playStatus,
  torrentStats,
  progressMessage,
  errorMessage,
  title,
  imageUrl,
  posterUrl,
  isHlsPreparing,
  isBuffering,
  hasVideoFiles,
  isActiveSession,
  bufferedPercent,
  showDebug,
  debugLogs,
  onCancel,
  onContinueInBackground,
  onAbortDownload,
  onRetry,
  onDeleteEmptyFiles,
  onToggleDebug,
  onCopyLogs,
  onClearLogs,
  cancelLabel,
  className = '',
  pipelineStatus = null,
  debugLogsUrl = null,
}: PlaybackStatusSurfaceProps) {
  const { t } = useI18n();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingDeleteEmpty, setConfirmingDeleteEmpty] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const sparseOrEmpty = isSparseOrEmptyError(errorMessage);

  const derived = derivePlaybackPhase({
    playStatus,
    torrentStats,
    isHlsPreparing,
    isBuffering,
    hasVideoFiles,
    errorMessage,
    isActiveSession: isActiveSession ?? (playStatus != null && playStatus !== 'idle'),
  });

  const label = phaseLabel(t, derived.phase) || progressMessage || '';
  const na = t('playback.metric.na') || '—';
  const speedLabel =
    derived.downloadSpeed != null && derived.downloadSpeed > 0
      ? formatSpeed(derived.downloadSpeed)
      : na;
  /** Retour = quitter l’overlay sans supprimer ; Annuler = retirer le torrent. */
  const backAction = onContinueInBackground ?? (onAbortDownload ? onCancel : undefined);
  const abortAction = onAbortDownload ?? onCancel;
  const etaLabel =
    derived.etaSeconds != null && derived.etaSeconds > 0
      ? formatTimeRemaining(derived.etaSeconds)
      : na;
  const downloadedLabel =
    derived.downloadedBytes != null ? formatBytes(derived.downloadedBytes) : na;
  const totalLabel =
    derived.totalBytes != null && derived.totalBytes > 0
      ? formatBytes(derived.totalBytes)
      : na;
  const peersLabel =
    derived.peersConnected != null
      ? `${derived.peersConnected}${derived.peersTotal != null ? `/${derived.peersTotal}` : ''}`
      : na;

  // Affiche portrait vs fond : poster prioritaire pour la carte, hero pour le flou.
  const artUrl = posterUrl || imageUrl || null;
  const backdropUrl = imageUrl || posterUrl || null;
  const showPoster = Boolean(artUrl) && !posterFailed;

  if (variant === 'chip') {
    if (derived.phase === 'idle' || derived.phase === 'ready') return null;
    const pct = derived.progressPercent;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-white/90 ${className}`}
        title={label}
      >
        <img src="/popcorn_logo.png" alt="" className="w-3.5 h-3.5 object-contain opacity-90" />
        {pct != null ? `${Math.round(pct)}%` : label}
      </span>
    );
  }

  if (variant === 'inline') {
    if (
      derived.phase === 'idle' ||
      derived.phase === 'ready' ||
      (!derived.isActivelyDownloading &&
        derived.phase !== 'resolving' &&
        derived.phase !== 'findingPeers' &&
        derived.phase !== 'error')
    ) {
      return null;
    }
    return (
      <div
        className={`glass-panel rounded-2xl border border-white/10 overflow-hidden animate-[fade-in_0.25s_ease-out] ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-stretch gap-0">
          {showPoster ? (
            <div className="relative w-16 sm:w-20 shrink-0 overflow-hidden">
              <img
                src={artUrl!}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setPosterFailed(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/40" />
            </div>
          ) : (
            <div className="w-14 shrink-0 flex items-center justify-center border-r border-white/10 bg-black/30">
              <img src="/popcorn_logo.png" alt="" className="w-7 h-7 object-contain opacity-80" />
            </div>
          )}
          <div className="flex-1 min-w-0 px-3.5 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/55 truncate">
                  {label}
                </span>
                <span className="text-lg font-bold tabular-nums text-white shrink-0">
                  {derived.progressPercent != null ? `${Math.round(derived.progressPercent)}%` : na}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, derived.progressPercent ?? (derived.phase === 'resolving' ? 8 : 0))}%`,
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/45">
                {derived.downloadSpeed != null && derived.downloadSpeed > 0 ? (
                  <span>{speedLabel}</span>
                ) : null}
                {derived.etaSeconds != null && derived.etaSeconds > 0 ? <span>{etaLabel}</span> : null}
                {derived.totalBytes != null && derived.totalBytes > 0 ? (
                  <span>
                    {downloadedLabel} / {totalLabel}
                  </span>
                ) : null}
              </div>
            </div>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                data-focusable
                tabIndex={0}
                className="shrink-0 rounded-xl border border-white/15 bg-white/5 hover:bg-red-500/20 hover:border-red-400/40 px-3 py-2 text-sm text-white/80 transition-colors"
              >
                {cancelLabel || t('common.cancel') || 'Annuler'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const isPlayer = variant === 'player';
  const isError = derived.phase === 'error';
  const showSteps =
    !isError &&
    (derived.phase === 'resolving' ||
      derived.phase === 'findingPeers' ||
      derived.phase === 'downloading');

  const shell = (
    <div
      className={`relative z-10 w-full min-w-0 ${isPlayer ? 'max-w-md' : 'max-w-xl'} mx-auto px-2 xs:px-4 animate-[fade-in_0.4s_ease-out] ${className}`}
    >
      {/* Brand Popcornn — masqué quand la hauteur ne suffit pas */}
      <div
        className={`justify-center mb-3 sm:mb-6 short:!hidden landscape-compact:!hidden ${
          isPlayer ? 'hidden sm:flex' : 'flex'
        }`}
      >
        <BrandMark size={isPlayer ? 'sm' : 'lg'} />
      </div>

      <div className="glass-panel deep-glass w-full rounded-[1.35rem] sm:rounded-[1.85rem] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden backdrop-blur-xl bg-black/40 flex flex-col min-w-0 landscape-compact:flex-row landscape-compact:items-stretch landscape-compact:max-h-[calc(100dvh-1.25rem)]">
        {/* Bandeau affiche + titre */}
        <div className="relative shrink-0 px-4 sm:px-7 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-white/8 landscape-compact:border-b-0 landscape-compact:border-r landscape-compact:w-[min(17rem,42%)] landscape-compact:flex landscape-compact:flex-col landscape-compact:justify-center">
          <div className="flex gap-3 sm:gap-5 items-center sm:items-end landscape-compact:flex-col landscape-compact:items-start min-w-0">
            {showPoster ? (
              <div className="relative z-10 shrink-0 sm:-mb-10 landscape-compact:!mb-0">
                <MediaPoster src={artUrl!} title={title} compact={isPlayer} />
                <img
                  src={artUrl!}
                  alt=""
                  className="hidden"
                  onError={() => setPosterFailed(true)}
                />
              </div>
            ) : null}
            <div className={`flex-1 min-w-0 ${showPoster ? 'sm:pb-1 sm:pt-1 landscape-compact:pb-0 landscape-compact:pt-0' : ''}`}>
              {title ? (
                <h2 className="text-white text-base xs:text-lg sm:text-2xl font-semibold tracking-tight line-clamp-2 break-words drop-shadow-md">
                  {title}
                </h2>
              ) : (
                <h2 className="text-white/80 text-base sm:text-lg font-medium tracking-tight">Popcornn</h2>
              )}
              <p className="mt-1 text-[11px] sm:text-sm text-white/45 font-medium tracking-wide uppercase line-clamp-2">
                {label || t('playback.loadingVideo')}
              </p>
              <div className="mt-2">
                <GpuPlaybackChip pipeline={pipelineStatus} />
              </div>
            </div>
          </div>
        </div>

        <div
          className={`min-w-0 min-h-0 px-4 sm:px-7 ${
            showPoster ? 'pt-4 sm:pt-12 landscape-compact:!pt-4' : 'pt-4 sm:pt-5'
          } pb-4 sm:pb-7 landscape-compact:flex-1 landscape-compact:overflow-y-auto landscape-compact:overscroll-contain`}
        >
          {showSteps ? <StepRail stepIndex={derived.stepIndex} t={t} /> : null}

          {isError ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-red-400/40 bg-red-500/15 flex items-center justify-center mb-3 sm:mb-4">
                <span className="text-xl sm:text-2xl text-red-300" aria-hidden>
                  ×
                </span>
              </div>
              <h3 className="text-white text-lg sm:text-2xl font-bold mb-2 px-1">
                {sparseOrEmpty
                  ? t('playback.sparseOrEmptyTitle') || phaseLabel(t, 'error')
                  : phaseLabel(t, 'error')}
              </h3>
              <p className="text-white/65 text-xs sm:text-sm mb-4 sm:mb-6 max-w-md break-words line-clamp-4 px-1">
                {sparseOrEmpty
                  ? t('playback.sparseOrEmptyDetail') ||
                    errorMessage ||
                    progressMessage ||
                    t('playback.errorStream')
                  : errorMessage || progressMessage || t('playback.errorStream')}
              </p>
              {sparseOrEmpty && onDeleteEmptyFiles && confirmingDeleteEmpty ? (
                <div className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-center space-y-3 mb-4">
                  <p className="text-sm text-white/85">
                    {t('playback.sparseOrEmptyConfirm') ||
                      'Supprimer les fichiers vides du disque ?'}
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteEmpty(false)}
                      data-focusable
                      tabIndex={0}
                      className="px-5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm"
                    >
                      {t('common.back') || 'Retour'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDeleteEmpty(false);
                        onDeleteEmptyFiles();
                      }}
                      data-focusable
                      tabIndex={0}
                      className="px-5 py-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white text-sm"
                    >
                      {t('common.confirm') || 'Confirmer'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-center gap-3">
                {sparseOrEmpty && onDeleteEmptyFiles && !confirmingDeleteEmpty ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteEmpty(true)}
                    data-focusable
                    tabIndex={0}
                    className="px-6 py-2.5 rounded-xl bg-red-600/85 hover:bg-red-600 text-white font-medium transition-colors"
                  >
                    {t('playback.sparseOrEmptyDelete') || 'Supprimer les fichiers vides'}
                  </button>
                ) : null}
                {onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    data-focusable
                    tabIndex={0}
                    className="px-6 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
                  >
                    {t('common.back') || 'Retour'}
                  </button>
                ) : null}
                {!sparseOrEmpty && onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    data-focusable
                    tabIndex={0}
                    className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
                  >
                    {t('common.retry') || 'Réessayer'}
                  </button>
                ) : null}
              </div>
              {debugLogsUrl || pipelineStatus ? (
                <div className="mt-5 w-full">
                  <PipelinePanel
                    status={pipelineStatus ?? null}
                    debugUrl={debugLogsUrl}
                    bufferedPercent={bufferedPercent}
                    t={t}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <ProgressRing
                percent={
                  // Pendant un vrai buffering lecture : jamais le % torrent (souvent 100 %
                  // sur un fichier déjà seedé) — sinon overlay trompeur "buffer 100%".
                  isBuffering || derived.phase === 'buffering' || derived.phase === 'preparingPlayback'
                    ? bufferedPercent != null && bufferedPercent > 0 && bufferedPercent < 100
                      ? bufferedPercent
                      : null
                    : derived.progressPercent
                }
                spinning={
                  derived.phase === 'resolving' ||
                  derived.phase === 'findingPeers' ||
                  derived.phase === 'preparingPlayback' ||
                  derived.phase === 'buffering'
                }
              />

              <h3
                key={derived.phase}
                className="text-white text-lg sm:text-[1.75rem] font-bold text-center tracking-tight mt-3 sm:mt-4 mb-1 animate-[fade-in_0.3s_ease-out] short:hidden landscape-compact:hidden"
              >
                {label}
              </h3>
              {progressMessage && progressMessage !== label ? (
                <p className="text-white/50 text-xs sm:text-sm text-center mb-4 sm:mb-5 font-light break-words line-clamp-3 px-1">
                  {progressMessage}
                </p>
              ) : (
                <div className="mb-3 sm:mb-5" />
              )}

              {derived.phase === 'preparingPlayback' ||
              derived.phase === 'buffering' ||
              pipelineStatus ? (
                <PipelinePanel
                  status={pipelineStatus ?? null}
                  debugUrl={debugLogsUrl}
                  bufferedPercent={bufferedPercent}
                  t={t}
                />
              ) : null}

              {derived.showTorrentMetrics ? (
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 mb-4 sm:mb-6 min-w-0">
                  <MetricCell
                    label={t('playback.metric.downloaded')}
                    value={
                      derived.totalBytes != null && derived.totalBytes > 0
                        ? `${downloadedLabel} / ${totalLabel}`
                        : downloadedLabel
                    }
                  />
                  <MetricCell label={t('playback.metric.eta')} value={etaLabel} />
                  <MetricCell label={t('playback.metric.speed')} value={speedLabel} />
                  <MetricCell label={t('playback.metric.peers')} value={peersLabel} />
                </div>
              ) : null}

              {!isPlayer && (backAction || abortAction) ? (
                <div className="flex flex-col items-center gap-3 mt-1">
                  {confirmingCancel ? (
                    <div className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-center space-y-3">
                      <p className="text-sm text-white/85">
                        {t('mediaDetail.cancelDownloadConfirm') ||
                          'Annuler et supprimer le téléchargement ?'}
                      </p>
                      <div className="flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(false)}
                          data-focusable
                          tabIndex={0}
                          className="px-5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm"
                        >
                          {t('common.back') || 'Retour'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingCancel(false);
                            abortAction?.();
                          }}
                          data-focusable
                          tabIndex={0}
                          className="px-5 py-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white text-sm"
                        >
                          {t('common.confirm') || 'Confirmer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-3">
                      {backAction ? (
                        <button
                          type="button"
                          onClick={backAction}
                          data-focusable
                          tabIndex={0}
                          className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
                        >
                          {t('common.back') || 'Retour'}
                        </button>
                      ) : null}
                      {abortAction ? (
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(true)}
                          data-focusable
                          tabIndex={0}
                          className="px-6 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
                        >
                          {cancelLabel || t('common.cancel') || 'Annuler'}
                        </button>
                      ) : null}
                    </div>
                  )}

                  {onToggleDebug ? (
                    <button
                      type="button"
                      onClick={onToggleDebug}
                      data-focusable
                      tabIndex={0}
                      className="text-xs text-white/45 hover:text-white/70 transition-colors"
                    >
                      {showDebug ? t('playback.hideDebug') : t('playback.showDebug')}
                    </button>
                  ) : null}

                  {showDebug && debugLogs && debugLogs.length > 0 ? (
                    <div className="w-full space-y-2">
                      <div className="flex justify-end gap-2">
                        {onCopyLogs ? (
                          <button
                            type="button"
                            onClick={onCopyLogs}
                            className="text-[11px] text-white/45 hover:text-white/70"
                          >
                            Copy
                          </button>
                        ) : null}
                        {onClearLogs ? (
                          <button
                            type="button"
                            onClick={onClearLogs}
                            className="text-[11px] text-white/45 hover:text-white/70"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="w-full max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 text-left text-[11px] text-white/60 font-mono space-y-1">
                        {debugLogs.slice(-40).map((log, i) => (
                          <div key={log.id ?? i}>
                            [{String(log.timestamp ?? log.time ?? '')}] [
                            {String(log.level || log.type || 'info')}] {String(log.message || '')}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isPlayer && (onCancel || onAbortDownload) ? (
                <div className="flex flex-col items-center gap-3 mt-3">
                  {confirmingCancel && onAbortDownload ? (
                    <div className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-center space-y-3">
                      <p className="text-sm text-white/85">
                        {t('mediaDetail.cancelDownloadConfirm') ||
                          'Annuler et supprimer le téléchargement ?'}
                      </p>
                      <div className="flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(false)}
                          data-focusable
                          tabIndex={0}
                          className="px-5 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm"
                        >
                          {t('common.back') || 'Retour'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmingCancel(false);
                            onAbortDownload();
                          }}
                          data-focusable
                          tabIndex={0}
                          className="px-5 py-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-white text-sm"
                        >
                          {t('common.confirm') || 'Confirmer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-3">
                      {onCancel ? (
                        <button
                          type="button"
                          onClick={onCancel}
                          data-focusable
                          tabIndex={0}
                          className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
                        >
                          {t('common.back') || 'Retour'}
                        </button>
                      ) : null}
                      {onAbortDownload ? (
                        <button
                          type="button"
                          onClick={() => setConfirmingCancel(true)}
                          data-focusable
                          tabIndex={0}
                          className="px-6 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
                        >
                          {cancelLabel || t('common.cancel') || 'Annuler'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (variant === 'player') {
    return (
      <div className="absolute inset-0 z-30 overflow-x-hidden overflow-y-auto overscroll-contain">
        {backdropUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-40"
              style={{ backgroundImage: `url(${backdropUrl})` }}
            />
            <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
          </>
        ) : (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
        )}
        <div className="relative z-10 flex min-h-full w-full items-center justify-center pt-[max(0.5rem,var(--safe-area-inset-top))] pr-[max(0.5rem,var(--safe-area-inset-right))] pb-[max(0.5rem,var(--safe-area-inset-bottom))] pl-[max(0.5rem,var(--safe-area-inset-left))]">
          {shell}
        </div>
      </div>
    );
  }

  // fullscreen — affiche + logo en composition
  return (
    <div className="player-progress-overlay fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain">
      {backdropUrl ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center scale-110 blur-3xl opacity-45 transition-opacity duration-700"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
        </>
      ) : (
        <div className="absolute inset-0 bg-black" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.12)_0%,transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]" />

      {backAction && !confirmingCancel ? (
        <button
          type="button"
          onClick={backAction}
          title={t('common.back') || 'Retour'}
          aria-label={t('common.back') || 'Retour'}
          tabIndex={0}
          data-focusable
          className="fixed z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors backdrop-blur-md"
          style={{
            top: 'max(1rem, var(--safe-area-inset-top))',
            left: 'max(1rem, var(--safe-area-inset-left))',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : abortAction && !confirmingCancel ? (
        <button
          type="button"
          onClick={() => setConfirmingCancel(true)}
          title={t('common.cancel') || 'Annuler'}
          aria-label={t('common.cancel') || 'Annuler'}
          tabIndex={0}
          data-focusable
          className="fixed z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors backdrop-blur-md"
          style={{
            top: 'max(1rem, var(--safe-area-inset-top))',
            left: 'max(1rem, var(--safe-area-inset-left))',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}

      <div className="relative z-10 flex min-h-full w-full items-center justify-center pt-[max(0.5rem,var(--safe-area-inset-top))] pr-[max(0.5rem,var(--safe-area-inset-right))] pb-[max(0.5rem,var(--safe-area-inset-bottom))] pl-[max(0.5rem,var(--safe-area-inset-left))]">
        {shell}
      </div>
    </div>
  );
}

export default PlaybackStatusSurface;
