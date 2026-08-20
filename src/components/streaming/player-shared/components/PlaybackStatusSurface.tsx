import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
import { generateQRCode } from '../../../../lib/utils/qrcode';
import { pipelineHeadline, type PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';
import { formatEtaSeconds } from '../../../../lib/streaming/networkPlaybackProfile';
import { PlaybackLiveTrace } from './PlaybackLiveTrace';
import type { PlaybackLiveTraceState } from '../hooks/usePlaybackLiveTrace';
import GpuPlaybackChip from './GpuPlaybackChip';
import { DsLoader } from '../../../ui/DsLoader';
import { DsProgressRing } from '../../../ui/DsProgressRing';
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

function isRemoteBackEvent(e: KeyboardEvent): boolean {
  const key = e.key;
  const code = e.keyCode ?? e.which;
  return (
    key === 'Escape' ||
    key === 'Backspace' ||
    key === 'Back' ||
    key === 'BrowserBack' ||
    key === 'GoBack' ||
    key === 'XF86Back' ||
    code === 27 ||
    code === 8 ||
    code === 461 ||
    code === 10009 ||
    code === 4 ||
    code === 166 ||
    code === 457
  );
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
  liveTrace?: PlaybackLiveTraceState | null;
}

const STEP_KEYS = ['queue', 'metadata', 'peers', 'download'] as const;

function phaseLabel(t: (k: string) => string, phase: PlaybackPhase): string {
  const key = PLAYBACK_PHASE_I18N_KEYS[phase];
  return t(key) || '';
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
      className={`relative shrink-0 overflow-hidden rounded-xl border border-white/15 shadow-lg bg-black/50 ${
        compact
          ? 'w-12 h-[4.5rem] sm:w-16 sm:h-24'
          : 'w-14 h-[5.25rem] sm:w-[5.5rem] sm:h-[8.25rem]'
      }`}
    >
      <img
        src={src}
        alt={title || ''}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl" />
    </div>
  );
}

function pipelineUserDetail(
  status: PlaybackPipelineStatus | null,
  progressMessage: string | null | undefined,
  phaseLabelText: string,
  t: (k: string, p?: Record<string, string | number>) => string,
): string | null {
  const eta = status?.eta_playable_seconds;
  if (eta != null && eta > 0) {
    return t('playback.hls.etaPlayable', { eta: formatEtaSeconds(eta) });
  }
  const headline = pipelineHeadline(status, t);
  const fromProgress =
    progressMessage && progressMessage !== phaseLabelText ? progressMessage : null;
  const detail = fromProgress || headline;
  if (!detail || detail === phaseLabelText) return null;
  return detail;
}

function PipelinePanel({
  status,
  debugUrl,
  bufferedPercent,
  showDebug,
  t,
}: {
  status: PlaybackPipelineStatus | null;
  debugUrl?: string | null;
  bufferedPercent?: number | null;
  showDebug?: boolean;
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
    <div className="w-full min-w-0 space-y-2">
      <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]/40 px-3 py-2.5 space-y-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ds-text-tertiary)] font-semibold mb-1">
            {t('playback.hls.serverPipeline')}
          </div>
          <div className="text-[11px] text-[var(--ds-text-secondary)] tabular-nums mb-1.5 break-words">
            {status
              ? t('playback.hls.segmentsReady', {
                  ready: status.segment_count,
                  expected: status.expected_segments || '…',
                })
              : t('playback.hls.serverPreparing')}
          </div>
          <div className="h-1 rounded-full bg-[var(--ds-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--ds-accent-yellow)] transition-[width] duration-500"
              style={{ width: `${serverPct ?? 10}%` }}
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ds-text-tertiary)] font-semibold mb-1">
            {t('playback.hls.playerBuffer')}
          </div>
          <div className="text-[11px] text-[var(--ds-text-secondary)] tabular-nums mb-1.5 break-words">
            {playerPct != null ? `${Math.round(playerPct)}%` : t('playback.hls.playlistReady')}
          </div>
          <div className="h-1 rounded-full bg-[var(--ds-border)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--ds-accent-violet)] transition-[width] duration-500"
              style={{ width: `${playerPct ?? 4}%` }}
            />
          </div>
        </div>
      </div>
      {showDebug && debugUrl ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={debugUrl}
              target="_blank"
              rel="noreferrer"
              data-focusable
              tabIndex={0}
              className="px-3 py-1.5 min-h-[44px] inline-flex items-center rounded-xl border border-white/15 bg-white/5 text-xs text-white/80"
            >
              {t('playback.hls.openLogs')}
            </a>
            <button
              type="button"
              onClick={loadQr}
              data-focusable
              tabIndex={0}
              className="px-3 py-1.5 min-h-[44px] rounded-xl border border-white/15 bg-white/5 text-xs text-white/80"
            >
              QR
            </button>
          </div>
          {qrOpen && qr ? (
            <div className="rounded-xl bg-white p-2">
              <img src={qr} alt={t('playback.hls.scanLogsQr')} className="w-32 h-32" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">{label}</div>
      <div className="text-xs sm:text-sm font-semibold text-white tabular-nums truncate">{value}</div>
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
  const p = percent != null ? Math.max(0, Math.min(100, percent)) : null;
  const showSpin = spinning && p == null;

  return (
    <div className="ds-loader ds-loader--lg ds-loader--player" role="status" aria-busy="true">
      <div className="ds-loader-mark">
        {showSpin ? (
          <>
            <div className="ds-loader-track" />
            <div className="ds-loader-spin" />
          </>
        ) : (
          <DsProgressRing
            value={p ?? 0}
            size={96}
            strokeWidth={3.25}
            aria-label={p != null ? `${Math.round(p)}%` : undefined}
          />
        )}
        <div className="ds-loader-core">
          <img src="/popcorn_logo.png" alt="" className="ds-loader-logo loading-icon-logo" />
        </div>
      </div>
      {p != null ? (
        <p className="ds-loader-percent">
          {Math.round(p)}
          <span>%</span>
        </p>
      ) : null}
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
    <div className="flex gap-1.5 w-full max-w-sm mx-auto mb-3 min-w-0">
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
  liveTrace = null,
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
  const bufferDetail = pipelineUserDetail(pipelineStatus, progressMessage, label, t);
  const na = t('playback.metric.na') || '—';
  const speedLabel =
    derived.downloadSpeed != null && derived.downloadSpeed > 0
      ? formatSpeed(derived.downloadSpeed)
      : na;
  /** Retour = quitter l’overlay sans supprimer ; Annuler = retirer le torrent. */
  const backAction = onContinueInBackground ?? (onAbortDownload ? onCancel : undefined);
  const abortAction = onAbortDownload ?? onCancel;
  const remoteBackAction = variant === 'player' ? onCancel : backAction ?? onCancel;
  const remoteBackRef = useRef(remoteBackAction);
  remoteBackRef.current = remoteBackAction;
  const confirmingCancelRef = useRef(confirmingCancel);
  confirmingCancelRef.current = confirmingCancel;

  useEffect(() => {
    if (variant !== 'player' && variant !== 'fullscreen') return;
    if (!remoteBackRef.current) return;

    const closeFromRemote = () => {
      if (confirmingCancelRef.current) {
        setConfirmingCancel(false);
        return;
      }
      remoteBackRef.current?.();
    };

    history.pushState({ popcornnPlaybackOverlay: true }, '');
    let ignorePop = false;
    const onPopState = () => {
      if (ignorePop) return;
      closeFromRemote();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isRemoteBackEvent(e)) return;
      e.preventDefault();
      e.stopPropagation();
      closeFromRemote();
    };
    const onWebOSBack = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      closeFromRemote();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('webosback', onWebOSBack);
    document.addEventListener('webOSBackButton', onWebOSBack);
    window.addEventListener('popstate', onPopState);
    return () => {
      ignorePop = true;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('webosback', onWebOSBack);
      document.removeEventListener('webOSBackButton', onWebOSBack);
      window.removeEventListener('popstate', onPopState);
      if (history.state && (history.state as { popcornnPlaybackOverlay?: boolean }).popcornnPlaybackOverlay) {
        history.back();
      }
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== 'player' && variant !== 'fullscreen') return;
    const id = window.setTimeout(() => {
      const overlay = document.querySelector('[data-playback-overlay]');
      const target =
        overlay?.querySelector<HTMLElement>('[data-autofocus]') ||
        overlay?.querySelector<HTMLElement>('[data-close]');
      target?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [variant, confirmingCancel]);

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
        <DsLoader size="xs" className="shrink-0" />
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
            {(derived.phase === 'resolving' || derived.phase === 'findingPeers' || derived.phase === 'buffering') && (
              <DsLoader size="xs" className="shrink-0" />
            )}
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
      className={`relative z-10 w-full min-w-0 ${isPlayer ? 'max-w-md' : 'max-w-lg'} mx-auto px-2 animate-[fade-in_0.35s_ease-out] ${className}`}
    >
      <div className="glass-panel deep-glass w-full rounded-2xl border border-white/12 shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl bg-black/50 flex flex-col min-w-0 max-h-[calc(100dvh-1rem)]">
        <div className="relative shrink-0 px-3 sm:px-5 pt-3 sm:pt-4 pb-2.5 border-b border-white/8">
          <div className="flex gap-3 items-center min-w-0">
            {showPoster ? (
              <div className="relative z-10 shrink-0">
                <MediaPoster src={artUrl!} title={title} compact />
                <img
                  src={artUrl!}
                  alt=""
                  className="hidden"
                  onError={() => setPosterFailed(true)}
                />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              {title ? (
                <h2 className="text-white text-sm sm:text-lg font-semibold tracking-tight line-clamp-2 break-words">
                  {title}
                </h2>
              ) : (
                <h2 className="text-white/80 text-sm font-medium tracking-tight">Popcornn</h2>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 min-w-0">
                <p className="text-[11px] text-[var(--ds-text-tertiary)] font-medium tracking-wide uppercase min-w-0">
                  {label || t('playback.loadingVideo')}
                </p>
                {showDebug ? <GpuPlaybackChip pipeline={pipelineStatus} /> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 pt-3 pb-3">
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
              {showDebug && (debugLogsUrl || pipelineStatus || liveTrace) ? (
                <div className="mt-5 w-full space-y-2">
                  {liveTrace ? <PlaybackLiveTrace trace={liveTrace} /> : null}
                  <PipelinePanel
                    status={pipelineStatus ?? null}
                    debugUrl={debugLogsUrl}
                    bufferedPercent={bufferedPercent}
                    showDebug
                    t={t}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center w-full py-2 sm:py-3">
                <ProgressRing
                  percent={
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

                {bufferDetail ? (
                  <p className="text-[var(--ds-text-secondary)] text-sm mt-3 mb-1 font-normal break-words px-2 leading-snug max-w-[18rem]">
                    {bufferDetail}
                  </p>
                ) : null}
              </div>

              {showDebug &&
              (derived.phase === 'preparingPlayback' ||
                derived.phase === 'buffering' ||
                pipelineStatus ||
                liveTrace) ? (
                <div className="mb-3 space-y-2">
                  {liveTrace ? <PlaybackLiveTrace trace={liveTrace} /> : null}
                  <PipelinePanel
                    status={pipelineStatus ?? null}
                    debugUrl={debugLogsUrl}
                    bufferedPercent={bufferedPercent}
                    showDebug
                    t={t}
                  />
                </div>
              ) : null}

              {derived.showTorrentMetrics ? (
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mb-3 min-w-0">
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
                          data-close
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
                          data-close
                          aria-label={t('common.close') || 'Fermer'}
                          tabIndex={0}
                          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
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
                          className="px-4 py-2.5 min-h-[44px] rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
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
                          data-close
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
                          data-close
                          aria-label={t('common.close') || 'Fermer'}
                          tabIndex={0}
                          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
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
                          className="px-4 py-2.5 min-h-[44px] rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
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
      <div
        className="absolute inset-0 z-30 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title || t('playback.phase.buffering') || 'Lecture'}
        data-playback-overlay
      >
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
        <div className="relative z-10 flex h-full w-full items-center justify-center p-[max(0.5rem,var(--safe-area-inset-top))] pb-[max(0.75rem,var(--safe-area-inset-bottom))] pl-[max(0.5rem,var(--safe-area-inset-left))] pr-[max(0.5rem,var(--safe-area-inset-right))]">
          {shell}
        </div>
      </div>
    );
  }

  // fullscreen — affiche + logo en composition
  return (
    <div
      className="player-progress-overlay fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={title || t('playback.phase.buffering') || 'Lecture'}
      data-playback-overlay
    >
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
          aria-label={t('common.close') || 'Fermer'}
          tabIndex={0}
          data-focusable
          data-close
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
