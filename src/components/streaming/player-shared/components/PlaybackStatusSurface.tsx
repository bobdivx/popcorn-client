import { useEffect, useRef, useState } from 'preact/hooks';
import { X } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { useRemoteFocusTrap } from '../../../../lib/tv/useRemoteFocusTrap';
import { useHistoryBackGuard } from '../../../../lib/navigation/historyBackGuard';
import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
import { generateQRCode } from '../../../../lib/utils/qrcode';
import { friendlyPlaybackHint, pipelineHeadline, type PlaybackPipelineStatus } from '../../../../lib/streaming/playbackPipeline';
import { DiagnoseAssist } from '../../../ai/DiagnoseAssist';
import { PlaybackLiveTrace } from './PlaybackLiveTrace';
import type { PlaybackLiveTraceState } from '../hooks/usePlaybackLiveTrace';
import GpuPlaybackChip from './GpuPlaybackChip';
import { DsLoader } from '../../../ui/DsLoader';
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
  liveTrace?: PlaybackLiveTraceState | null;
  /** Transition qualité (ex. 4K → 1080p) : pastille animée, pas un pavé de texte. */
  qualityTransition?: boolean;
}

function phaseLabel(t: (k: string) => string, phase: PlaybackPhase): string {
  const key = PLAYBACK_PHASE_I18N_KEYS[phase];
  return t(key) || '';
}

function pipelineUserDetail(
  status: PlaybackPipelineStatus | null,
  progressMessage: string | null | undefined,
  phaseLabelText: string,
  t: (k: string, p?: Record<string, string | number>) => string,
): string | null {
  // ETA brute (« Lecture dans 23 s ») → pastille animée, pas ce sous-titre.
  const headline = pipelineHeadline(status, t);
  const fromProgress =
    progressMessage && progressMessage !== phaseLabelText ? progressMessage : null;
  const detail = fromProgress || headline;
  if (!detail || detail === phaseLabelText) return null;
  return detail;
}

/** Piste corail éditoriale — même langage que #popcorn-loading-fallback, réactive aux phases. */
function EditorialPhaseLine({
  phase,
  percent,
  stepIndex,
}: {
  phase: PlaybackPhase;
  percent: number | null;
  stepIndex: number;
}) {
  const p = percent != null && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
  const determinate =
    p != null &&
    (phase === 'downloading' ||
      phase === 'buffering' ||
      phase === 'preparingPlayback' ||
      phase === 'ready' ||
      phase === 'checking');
  const mode =
    determinate
      ? 'fill'
      : phase === 'findingPeers'
        ? 'seek'
        : phase === 'checking' || phase === 'resolving'
          ? 'pulse'
          : 'run';

  return (
    <div
      className={`ed-playback-track ed-playback-track--${mode}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate && p != null ? Math.round(p) : undefined}
      aria-busy={!determinate || (p != null && p < 100)}
    >
      <div className="ed-playback-track__rail">
        <div
          className="ed-playback-track__fill"
          style={determinate && p != null ? { width: `${p}%` } : undefined}
        />
      </div>
      <div className="ed-playback-track__steps" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`ed-playback-track__step${stepIndex >= n ? ' is-on' : ''}${stepIndex === n ? ' is-active' : ''}`}
          />
        ))}
      </div>
      {determinate && p != null ? (
        <span className="ed-playback-track__pct">{Math.round(p)}%</span>
      ) : null}
    </div>
  );
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
      <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]/40 backdrop-blur-sm px-3 py-2.5 space-y-3 transition-all duration-300">
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
              className="h-full rounded-full bg-[var(--ds-accent-yellow)] transition-all duration-500 ease-out"
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
              className="h-full rounded-full bg-[var(--ds-accent-violet)] transition-all duration-500 ease-out"
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
              className="px-3 py-1.5 min-h-[44px] inline-flex items-center rounded-xl border border-white/15 bg-white/5 text-xs text-white/80 hover:bg-white/10 transition-colors"
            >
              {t('playback.hls.openLogs')}
            </a>
            <button
              type="button"
              onClick={loadQr}
              data-focusable
              tabIndex={0}
              className="px-3 py-1.5 min-h-[44px] rounded-xl border border-white/15 bg-white/5 text-xs text-white/80 hover:bg-white/10 transition-colors"
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

/**
 * Surface unique d'état lecture/téléchargement.
 * Variantes: fullscreen | player | inline | chip
 * Player/fullscreen : splash éditorial (marque + titre + piste d'états).
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
  qualityTransition = false,
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
  const hint = friendlyPlaybackHint({
    qualityTransition,
    etaPlayableSeconds: pipelineStatus?.eta_playable_seconds,
    isBuffering: isBuffering || derived.phase === 'buffering' || derived.phase === 'preparingPlayback',
    playlistReady: Boolean(pipelineStatus?.playlist_ready) || (pipelineStatus?.segment_count ?? 0) > 0,
    t,
  });
  const bufferDetail = hint ? null : pipelineUserDetail(pipelineStatus, progressMessage, label, t);
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

  const confirmingDeleteEmptyRef = useRef(confirmingDeleteEmpty);
  confirmingDeleteEmptyRef.current = confirmingDeleteEmpty;
  const isModalVariant = variant === 'player' || variant === 'fullscreen';
  const lastRemoteBackAtRef = useRef(0);
  /** Retour télécommande / historique : un seul effet par appui (keydown + webosback + popstate dédoublonnés). */
  const closeFromRemote = () => {
    const now = Date.now();
    if (now - lastRemoteBackAtRef.current < 600) return;
    lastRemoteBackAtRef.current = now;
    if (confirmingDeleteEmptyRef.current) {
      setConfirmingDeleteEmpty(false);
      return;
    }
    if (confirmingCancelRef.current) {
      setConfirmingCancel(false);
      return;
    }
    remoteBackRef.current?.();
  };
  const closeFromRemoteRef = useRef(closeFromRemote);
  closeFromRemoteRef.current = closeFromRemote;

  // Carte modale : focus auto sur le 1er bouton, flèches/OK entre les boutons, focus piégé,
  // Retour = fermer (le lecteur et la page derrière ne reçoivent plus les touches).
  const trapRef = useRef<HTMLDivElement>(null);
  useRemoteFocusTrap(trapRef, {
    active: isModalVariant,
    onBack: () => closeFromRemoteRef.current(),
  });

  // Retour système Android / navigateur (popstate) : même fermeture, une seule fois.
  // - variante « player » : c'est le lecteur (VideoPlayerWrapper) qui tient l'entrée
  //   d'historique ; avant, chaque overlay de chargement / buffering poussait la sienne et la
  //   laissait derrière lui (Retour « mort » après chaque buffering) ;
  // - variante « fullscreen » (panneau de téléchargement sur la fiche) : garde dédiée, retirée
  //   proprement à la fermeture.
  useHistoryBackGuard(variant === 'fullscreen' && !!remoteBackAction, () => closeFromRemoteRef.current());

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
        className={`ed-playback-chip inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-white/90 ${className}`}
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
        derived.phase !== 'checking' &&
        derived.phase !== 'error')
    ) {
      return null;
    }
    const cancelText = cancelLabel || t('common.cancel') || 'Annuler';
    const pct =
      derived.progressPercent != null
        ? Math.round(derived.progressPercent)
        : null;
    return (
      <div
        className={`ed-playback-inline glass-panel rounded-2xl border border-white/10 overflow-hidden animate-[fade-in_0.25s_ease-out] ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-stretch gap-0">
          {showPoster ? (
            <div className="relative w-[4.25rem] sm:w-24 shrink-0 overflow-hidden self-stretch min-h-[5.5rem]">
              <img
                src={artUrl!}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setPosterFailed(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/50" />
            </div>
          ) : (
            <div className="w-14 shrink-0 flex items-center justify-center border-r border-white/10 bg-black/30">
              <img src="/popcorn_logo.png" alt="" className="w-7 h-7 object-contain opacity-80" />
            </div>
          )}
          <div className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 sm:py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                {(derived.phase === 'resolving' ||
                  derived.phase === 'checking' ||
                  derived.phase === 'findingPeers' ||
                  derived.phase === 'buffering') && (
                  <DsLoader size="xs" className="shrink-0" />
                )}
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-white/50 truncate">
                  {label}
                </span>
                <span className="ml-auto text-xl sm:text-2xl font-bold tabular-nums text-white shrink-0 leading-none">
                  {pct != null ? `${pct}%` : na}
                </span>
              </div>
              <div className="ed-playback-progress h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, derived.progressPercent ?? (derived.phase === 'resolving' ? 8 : 0))}%`,
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-white/55">
                {derived.downloadSpeed != null && derived.downloadSpeed > 0 ? (
                  <span className="font-semibold text-white/85 tabular-nums">{speedLabel}</span>
                ) : null}
                {derived.etaSeconds != null && derived.etaSeconds > 0 ? (
                  <span className="tabular-nums">{etaLabel}</span>
                ) : null}
                {derived.totalBytes != null && derived.totalBytes > 0 ? (
                  <span className="tabular-nums">
                    {downloadedLabel}
                    <span className="text-white/35"> / </span>
                    {totalLabel}
                  </span>
                ) : null}
                {derived.peersConnected != null ? (
                  <span className="text-white/40 tabular-nums">{peersLabel} peers</span>
                ) : null}
              </div>
            </div>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                data-focusable
                tabIndex={0}
                title={cancelText}
                aria-label={cancelText}
                className="gtv-icon-btn ds-focus-glow ds-active-glow shrink-0 self-center hover:bg-red-500/20 hover:border-red-400/40 hover:text-red-200"
              >
                <X className="h-5 w-5" size={20} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const isPlayer = variant === 'player';
  const isError = derived.phase === 'error';
  const trackPercent =
    isBuffering || derived.phase === 'buffering' || derived.phase === 'preparingPlayback'
      ? bufferedPercent != null && bufferedPercent > 0 && bufferedPercent < 100
        ? bufferedPercent
        : derived.progressPercent
      : derived.progressPercent;
  const statusText =
    hint?.label ||
    bufferDetail ||
    label ||
    t('playback.loadingVideo') ||
    'Chargement…';
  const metricsLine = derived.showTorrentMetrics
    ? [
        trackPercent != null ? `${Math.round(trackPercent)}%` : null,
        derived.downloadSpeed != null && derived.downloadSpeed > 0 ? speedLabel : null,
        derived.peersConnected != null ? peersLabel : null,
        derived.etaSeconds != null && derived.etaSeconds > 0 ? etaLabel : null,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';

  const shell = (
    <div
      className={`relative z-10 w-full min-w-0 max-w-2xl mx-auto px-4 animate-[fade-in_0.35s_ease-out] ${className}`}
    >
      <div className="ed-playback-splash flex flex-col items-center text-center min-w-0 max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain">
          {isError ? (
            <div className="ed-playback-splash__error flex flex-col items-center text-center w-full">
              <div className="ed-playback-splash__brand">Popcornn</div>
              <h2 className="ed-playback-splash__title">
                {sparseOrEmpty
                  ? t('playback.sparseOrEmptyTitle') || phaseLabel(t, 'error')
                  : phaseLabel(t, 'error')}
              </h2>
              <div className="ed-playback-track ed-playback-track--error" aria-hidden="true">
                <div className="ed-playback-track__rail">
                  <div className="ed-playback-track__fill" style={{ width: '100%' }} />
                </div>
              </div>
              <p className="ed-playback-splash__status ed-playback-splash__status--error">
                {sparseOrEmpty
                  ? t('playback.sparseOrEmptyDetail') ||
                    errorMessage ||
                    progressMessage ||
                    t('playback.errorStream')
                  : errorMessage || progressMessage || t('playback.errorStream')}
              </p>
              <DiagnoseAssist message={errorMessage} />
              {sparseOrEmpty && onDeleteEmptyFiles && confirmingDeleteEmpty ? (
                <div className="w-full max-w-sm border border-white/15 bg-black/45 px-4 py-3 text-center space-y-3 mb-4 mt-4">
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
                      className="ed-playback-btn-ghost px-5 py-2 text-white text-sm"
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
                      className="ed-playback-btn px-5 py-2 text-white text-sm"
                    >
                      {t('common.confirm') || 'Confirmer'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {sparseOrEmpty && onDeleteEmptyFiles && !confirmingDeleteEmpty ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteEmpty(true)}
                    data-focusable
                    data-autofocus
                    tabIndex={0}
                    className="ed-playback-btn px-6 py-2.5 text-white font-medium transition-colors"
                  >
                    {t('playback.sparseOrEmptyDelete') || 'Supprimer les fichiers vides'}
                  </button>
                ) : null}
                {onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    data-focusable
                    data-autofocus={!(sparseOrEmpty && onDeleteEmptyFiles && !confirmingDeleteEmpty) || undefined}
                    tabIndex={0}
                    className="ed-playback-btn-ghost px-6 py-2.5 text-white font-medium transition-colors"
                  >
                    {t('common.back') || 'Retour'}
                  </button>
                ) : null}
                {!sparseOrEmpty && onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    data-focusable
                    data-autofocus={!onCancel || undefined}
                    tabIndex={0}
                    className="ed-playback-btn px-6 py-2.5 text-white font-medium transition-colors"
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
              <div className="ed-playback-splash__brand">Popcornn</div>
              {title ? (
                <p className="ed-playback-splash__media">{title}</p>
              ) : null}
              <h1 className="ed-playback-splash__title">
                {t('playback.displayTitle') || 'Chargement'}
              </h1>
              <EditorialPhaseLine
                phase={derived.phase}
                percent={trackPercent}
                stepIndex={derived.stepIndex}
              />
              <p
                key={statusText}
                className="ed-playback-splash__status"
                role="status"
                aria-live="polite"
              >
                {statusText}
              </p>
              {showDebug ? (
                <div className="mt-2">
                  <GpuPlaybackChip pipeline={pipelineStatus} />
                </div>
              ) : null}
              {metricsLine ? (
                <p className="ed-playback-splash__metrics">{metricsLine}</p>
              ) : null}

              {showDebug &&
              (derived.phase === 'preparingPlayback' ||
                derived.phase === 'buffering' ||
                pipelineStatus ||
                liveTrace) ? (
                <div className="mb-3 mt-3 w-full max-w-md space-y-2">
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
                          data-autofocus
                          aria-label={t('common.close') || 'Fermer'}
                          tabIndex={0}
                          className="ed-playback-btn px-6 py-2.5 min-h-[44px] text-white font-medium transition-colors"
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
                          className="ed-playback-btn-ghost px-6 py-2.5 min-h-[44px] text-white font-medium transition-colors"
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
                <div className="flex flex-col items-center gap-3 mt-5">
                  {confirmingCancel && onAbortDownload ? (
                    <div className="w-full max-w-sm border border-white/15 bg-black/45 px-4 py-3 text-center space-y-3">
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
                          className="ed-playback-btn-ghost px-5 py-2 text-white text-sm"
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
                          className="ed-playback-btn px-5 py-2 text-white text-sm"
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
                          data-autofocus
                          aria-label={t('common.close') || 'Fermer'}
                          tabIndex={0}
                          className="ed-playback-btn px-6 py-2.5 min-h-[44px] text-white font-medium transition-colors"
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
                          className="ed-playback-btn-ghost px-6 py-2.5 min-h-[44px] text-white font-medium transition-colors"
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
  );

  if (variant === 'player') {
    return (
      <div
        ref={trapRef}
        className="absolute inset-0 z-30 overflow-hidden"
        role="dialog"
        aria-modal="true"
        data-remote-trap
        aria-label={title || t('playback.phase.buffering') || 'Lecture'}
        data-playback-overlay
      >
        {backdropUrl ? (
          <>
            <div
              className="ed-playback-splash__backdrop absolute inset-0 bg-cover bg-center scale-105 opacity-30"
              style={{ backgroundImage: `url(${backdropUrl})` }}
            />
            <div className="absolute inset-0 bg-[var(--ed-bg,#0c0d10)]/88" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[var(--ed-bg,#0c0d10)]/92" />
        )}
        <div className="relative z-10 flex h-full w-full items-center justify-center p-[max(0.5rem,var(--safe-area-inset-top))] pb-[max(0.75rem,var(--safe-area-inset-bottom))] pl-[max(0.5rem,var(--safe-area-inset-left))] pr-[max(0.5rem,var(--safe-area-inset-right))]">
          {shell}
        </div>
      </div>
    );
  }

  // fullscreen — même composition splash que le chargement des pages
  return (
    <div
      ref={trapRef}
      className="player-progress-overlay fixed inset-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      data-remote-trap
      aria-label={title || t('playback.phase.buffering') || 'Lecture'}
      data-playback-overlay
    >
      {backdropUrl ? (
        <>
          <div
            className="ed-playback-splash__backdrop absolute inset-0 bg-cover bg-center scale-105 opacity-25"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
          <div className="absolute inset-0 bg-[var(--ed-bg,#0c0d10)]/90" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[var(--ed-bg,#0c0d10)]" />
      )}

      {backAction && !confirmingCancel ? (
        <button
          type="button"
          onClick={backAction}
          title={t('common.back') || 'Retour'}
          aria-label={t('common.close') || 'Fermer'}
          tabIndex={0}
          data-focusable
          data-close
          className="fixed z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#f2545b] transition-colors backdrop-blur-md"
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
          className="fixed z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#f2545b] transition-colors backdrop-blur-md"
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
