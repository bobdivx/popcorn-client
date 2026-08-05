import { LoadingIcon } from '../../../ui/LoadingIcon';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { PlayerLoadingTorrentStats } from './PlayerLoadingOverlay';
import { PlayerOverlayChrome } from './PlayerOverlayChrome';
import { TorrentStatsBlock } from './TorrentStatsBlock';

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

  const statusMessage =
    message ||
    (roundedBuffer > 0
      ? t('playback.bufferingProgress', { percent: roundedBuffer })
      : t('playback.buffering'));

  return (
    <PlayerOverlayChrome onClose={onClose} closeLabel={effectiveCloseLabel} role="status">
      {title && (
        <h2 className="text-white text-xl sm:text-2xl font-semibold tracking-tight mb-4 line-clamp-2 px-2">
          {title}
        </h2>
      )}

      <LoadingIcon className="mb-6">
        <img
          src="/popcorn_logo.png"
          alt=""
          className="w-full h-full object-contain"
          style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))' }}
        />
      </LoadingIcon>

      <p className="text-white/90 text-lg font-medium">{statusMessage}</p>

      <div className="w-full max-w-xs mt-5 space-y-2">
        <div className="flex justify-between text-xs text-white/60">
          <span>{t('playback.bufferLabel') || 'Buffer'}</span>
          <span>{roundedBuffer}%</span>
        </div>
        <div
          className="w-full bg-white/10 rounded-full h-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={roundedBuffer}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('playback.bufferLabel') || 'Buffer'}
        >
          {roundedBuffer > 0 ? (
            <div
              className="bg-primary-500 h-full rounded-full transition-[width] duration-300"
              style={{ width: `${roundedBuffer}%` }}
            />
          ) : (
            <div className="ds-progress-container !max-w-none !m-0 h-full">
              <div className="ds-progress-bar" />
              <div className="ds-progress-wave" />
            </div>
          )}
        </div>
      </div>

      {torrentStats && (
        <TorrentStatsBlock torrentStats={torrentStats} variant="card" barTone="emerald" />
      )}

      {detailMessage && (
        <p className="text-white/50 text-sm mt-4 font-light max-w-sm">{detailMessage}</p>
      )}

      {badge && (
        <div className="mt-4 px-3 py-1 bg-primary-500/20 border border-primary-400/50 rounded-full">
          <span className="text-primary-200 text-sm font-semibold">{badge}</span>
        </div>
      )}

      <div className="flex gap-1 mt-4">
        <span
          className="w-2 h-2 bg-primary-500 rounded-full"
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }}
        />
        <span
          className="w-2 h-2 bg-primary-500 rounded-full"
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}
        />
        <span
          className="w-2 h-2 bg-primary-500 rounded-full"
          style={{ animation: 'hls-bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}
        />
      </div>

      <style>{`
        @keyframes hls-bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </PlayerOverlayChrome>
  );
}
