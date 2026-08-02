import { useEffect } from 'preact/hooks';
import { LoadingIcon } from '../../../ui/LoadingIcon';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { formatBytes, formatSpeed, formatTimeRemaining } from '../../../../lib/utils/formatBytes';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';

export interface PlayerBufferingOverlayProps {
  /** Titre du média (film / épisode). */
  title?: string | null;
  /** Pourcentage de buffer vidéo (0–100). */
  bufferedPercent?: number;
  /** Message principal (sinon i18n buffering / bufferingProgress). */
  message?: string | null;
  /** Détail technique (ex. retries 503, préparation flux). */
  detailMessage?: string | null;
  /** Stats torrent pour vitesse / peers / progression téléchargement. */
  torrentStats?: PlayerLoadingTorrentStats | null;
  /** Fermer / arrêter la lecture. */
  onClose?: () => void;
  /** Libellé du bouton fermer. */
  closeLabel?: string;
  /** Badge optionnel (ex. « Lucie Player »). */
  badge?: string | null;
}

/**
 * Overlay plein écran pendant le buffering in-player :
 * titre, % buffer, stats torrent et bouton Fermer toujours visibles.
 */
export default function PlayerBufferingOverlay({
  title,
  bufferedPercent = 0,
  message,
  detailMessage,
  torrentStats,
  onClose,
  closeLabel,
  badge,
}: PlayerBufferingOverlayProps) {
  const { t } = useI18n();
  const effectiveCloseLabel = closeLabel || t('common.close') || 'Fermer';
  const roundedBuffer = Math.max(0, Math.min(100, Math.round(bufferedPercent)));

  // Escape / Retour ferme immédiatement pendant le buffering (sans devoir afficher les contrôles).
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const code = e.keyCode ?? e.which;
      const isBack =
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'Back' ||
        key === 'BrowserBack' ||
        key === 'GoBack' ||
        code === 27 ||
        code === 8 ||
        code === 461 ||
        code === 10009;
      if (!isBack) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const statusMessage =
    message ||
    (roundedBuffer > 0
      ? t('playback.bufferingProgress', { percent: roundedBuffer })
      : t('playback.buffering'));

  const isCompleted =
    torrentStats != null &&
    (torrentStats.state === 'completed' ||
      torrentStats.state === 'seeding' ||
      (torrentStats.progress != null && torrentStats.progress >= 0.99));

  const isActivelyDownloading =
    torrentStats != null &&
    !isCompleted &&
    (torrentStats.state === 'downloading' ||
      (torrentStats.download_speed ?? 0) > 0 ||
      (torrentStats.progress != null && torrentStats.progress > 0 && torrentStats.progress < 0.99));

  const progressFromBytes =
    torrentStats?.total_bytes != null &&
    torrentStats.total_bytes > 0 &&
    torrentStats?.downloaded_bytes != null
      ? (torrentStats.downloaded_bytes / torrentStats.total_bytes) * 100
      : null;
  const downloadPercent =
    progressFromBytes != null
      ? Math.round(progressFromBytes * 10) / 10
      : torrentStats?.progress != null
        ? Math.round(torrentStats.progress * 100 * 10) / 10
        : null;

  const downloadSpeedLabel =
    torrentStats?.download_speed != null && torrentStats.download_speed > 0
      ? formatSpeed(torrentStats.download_speed)
      : null;
  const downloadedFormatted =
    torrentStats?.downloaded_bytes != null ? formatBytes(torrentStats.downloaded_bytes) : null;
  const totalFormatted =
    torrentStats?.total_bytes != null ? formatBytes(torrentStats.total_bytes) : null;
  const etaFormatted =
    torrentStats?.eta_seconds != null && torrentStats.eta_seconds > 0
      ? formatTimeRemaining(torrentStats.eta_seconds)
      : null;

  const showTorrentStats =
    isActivelyDownloading &&
    torrentStats &&
    (downloadPercent != null ||
      downloadSpeedLabel != null ||
      (downloadedFormatted != null && totalFormatted != null));

  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center bg-black z-30"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Bouton fermer toujours accessible (souris / tactile) */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title={effectiveCloseLabel}
          aria-label={effectiveCloseLabel}
          tabIndex={0}
          data-focusable
          class="absolute top-4 left-4 z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      <div class="text-center max-w-md w-full px-6 flex flex-col items-center">
        {title && (
          <h2 class="text-white text-xl sm:text-2xl font-semibold tracking-tight mb-4 line-clamp-2 px-2">
            {title}
          </h2>
        )}

        <LoadingIcon className="mb-6">
          <img
            src="/popcorn_logo.png"
            alt=""
            class="w-full h-full object-contain"
            style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))' }}
          />
        </LoadingIcon>

        <p class="text-white/90 text-lg font-medium">{statusMessage}</p>

        {/* Barre de buffer vidéo */}
        <div class="w-full max-w-xs mt-5 space-y-2">
          <div class="flex justify-between text-xs text-white/60">
            <span>{t('playback.bufferLabel') || 'Buffer'}</span>
            <span>{roundedBuffer}%</span>
          </div>
          <div
            class="w-full bg-white/10 rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={roundedBuffer}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('playback.bufferLabel') || 'Buffer'}
          >
            {roundedBuffer > 0 ? (
              <div
                class="bg-primary-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${roundedBuffer}%` }}
              />
            ) : (
              <div class="ds-progress-container !max-w-none !m-0 h-full">
                <div class="ds-progress-bar" />
                <div class="ds-progress-wave" />
              </div>
            )}
          </div>
        </div>

        {/* Stats torrent si téléchargement encore actif */}
        {showTorrentStats && torrentStats && (
          <div class="mt-5 w-full max-w-xs space-y-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            {(downloadPercent != null || (downloadedFormatted != null && totalFormatted != null)) && (
              <>
                <div class="flex justify-between text-sm text-white/70">
                  <span>
                    {t('playback.downloadProgress') || 'Téléchargement'}{' '}
                    {downloadPercent != null ? `${downloadPercent}%` : ''}
                  </span>
                  {downloadedFormatted != null && totalFormatted != null && (
                    <span class="text-white/50">
                      {downloadedFormatted} / {totalFormatted}
                    </span>
                  )}
                </div>
                {downloadPercent != null && (
                  <div class="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      class="bg-emerald-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, downloadPercent)}%` }}
                    />
                  </div>
                )}
              </>
            )}
            <div class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/60 pt-1">
              {downloadSpeedLabel && (
                <span>
                  {t('playback.downloadSpeed') || 'Vitesse'} {downloadSpeedLabel}
                </span>
              )}
              {etaFormatted && (
                <span>
                  {t('torrentStats.eta') || 'Temps restant'} {etaFormatted}
                </span>
              )}
              {(torrentStats.peers_connected != null || torrentStats.peers_total != null) && (
                <span>
                  {t('downloads.stats.peers') || 'Peers'}{' '}
                  {torrentStats.peers_connected ?? 0}/{torrentStats.peers_total ?? 0}
                </span>
              )}
              {(torrentStats.seeders ?? 0) > 0 && (
                <span>
                  {t('downloads.stats.seeders') || 'Seeders'} {torrentStats.seeders}
                </span>
              )}
            </div>
          </div>
        )}

        {detailMessage && (
          <p class="text-white/50 text-sm mt-4 font-light max-w-sm">{detailMessage}</p>
        )}

        {badge && (
          <div class="mt-4 px-3 py-1 bg-primary-500/20 border border-primary-400/50 rounded-full">
            <span class="text-primary-200 text-sm font-semibold">{badge}</span>
          </div>
        )}

        <div class="flex gap-1 mt-4">
          <span
            class="w-2 h-2 bg-primary-500 rounded-full"
            style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
          />
          <span
            class="w-2 h-2 bg-primary-500 rounded-full"
            style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
          />
          <span
            class="w-2 h-2 bg-primary-500 rounded-full"
            style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
          />
        </div>

        {/* Bouton Fermer visible (télécommande / clavier) */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title={effectiveCloseLabel}
            aria-label={effectiveCloseLabel}
            tabIndex={0}
            data-focusable
            class="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-black min-h-[44px] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
            {effectiveCloseLabel}
          </button>
        )}
      </div>

      <style>{`
        @keyframes hls-bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
