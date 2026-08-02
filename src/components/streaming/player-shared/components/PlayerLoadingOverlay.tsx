import { useEffect } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { StreamingStepIndicator } from './StreamingStepIndicator';
import { formatBytes, formatTimeRemaining } from '../../../../lib/utils/formatBytes';

/** Stats torrent minimales pour affichage en temps réel dans l'overlay. */
export interface PlayerLoadingTorrentStats {
  progress?: number;
  state?: string;
  download_speed?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  eta_seconds?: number;
  peers_connected?: number;
  peers_total?: number;
  seeders?: number;
}

interface PlayerLoadingOverlayProps {
  message: string;
  /** Titre du média affiché au-dessus du spinner. */
  title?: string | null;
  /** Étape courante (1-4) pour la barre d'étapes streaming. */
  loadingStep?: number;
  /** Message de détail (ex. "Recherche de peers..."). */
  progressMessage?: string;
  /** Stats du client torrent pour affichage en temps réel (%, vitesse, ETA, peers). */
  torrentStats?: PlayerLoadingTorrentStats | null;
  /** Callback annulation ; si fourni, affiche le bouton Annuler (focusable télécommande). */
  onCancel?: () => void;
  /** Libellé du bouton Annuler (i18n). */
  cancelLabel?: string;
}

export default function PlayerLoadingOverlay({
  message,
  title,
  loadingStep = 0,
  progressMessage,
  torrentStats,
  onCancel,
  cancelLabel,
}: PlayerLoadingOverlayProps) {
  const { t } = useI18n();
  const defaultCancelLabel = t('common.cancel') ?? 'Annuler';
  const closeLabel = t('common.close') ?? 'Fermer';

  // Déterminer si le fichier est déjà téléchargé (ne pas afficher les stats de téléchargement)
  const isCompleted =
    torrentStats != null &&
    (torrentStats.state === 'completed' ||
      torrentStats.state === 'seeding' ||
      (torrentStats.progress != null && torrentStats.progress >= 0.99));

  // Le téléchargement est réellement en cours (pas terminé, pas en file d'attente)
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
  const progressPercent =
    progressFromBytes != null
      ? Math.round(progressFromBytes * 10) / 10
      : torrentStats?.progress != null
        ? Math.round(torrentStats.progress * 100 * 10) / 10
        : 0;
  const downloadSpeedMb = torrentStats?.download_speed
    ? (torrentStats.download_speed / (1024 * 1024)).toFixed(1)
    : null;
  const downloadedFormatted = torrentStats?.downloaded_bytes != null
    ? formatBytes(torrentStats.downloaded_bytes)
    : null;
  const totalFormatted = torrentStats?.total_bytes != null ? formatBytes(torrentStats.total_bytes) : null;
  const etaFormatted =
    torrentStats?.eta_seconds != null && torrentStats.eta_seconds > 0
      ? formatTimeRemaining(torrentStats.eta_seconds)
      : null;

  // Message adapté à la situation réelle
  const stateLabel = isCompleted
    ? (t('playback.preparingStream') || 'Préparation du flux…')
    : torrentStats?.state === 'queued'
      ? (t('playback.queued') || 'En file d\'attente')
      : torrentStats?.state === 'downloading' || isActivelyDownloading
        ? (t('playback.downloading') || 'Téléchargement en cours')
        : message;

  // Bouton d'annulation : adapter le libellé
  const effectiveCancelLabel = isCompleted ? closeLabel : (cancelLabel || defaultCancelLabel);

  useEffect(() => {
    if (!onCancel) return;
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
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-30">
      {/* Bouton fermer toujours accessible en haut à gauche */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          title={effectiveCancelLabel}
          aria-label={effectiveCancelLabel}
          tabIndex={0}
          data-focusable
          className="absolute top-4 left-4 z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors"
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

      <div className="text-center max-w-md px-4 flex flex-col items-center">
        {title && (
          <h2 className="text-white text-xl sm:text-2xl font-semibold tracking-tight mb-4 line-clamp-2 px-2">
            {title}
          </h2>
        )}

        {/* Spinner + message principal */}
        <div className="relative w-32 h-32 mb-4 mx-auto">
          <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-2 flex items-center justify-center animate-pulse">
            <img
              src="/popcorn_logo.png"
              alt="Popcorn"
              className="w-full h-full object-contain"
              style={{ filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))' }}
            />
          </div>
        </div>
        <p className="text-white/80 text-lg font-medium">{stateLabel}</p>
        <div className="flex gap-1 mt-2 justify-center">
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
          <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>

        {/* Stats réelles du torrent — seulement si le téléchargement est réellement en cours */}
        {isActivelyDownloading && torrentStats &&
          (torrentStats.progress != null ||
            (torrentStats.download_speed ?? 0) > 0 ||
            (torrentStats.downloaded_bytes != null && torrentStats.total_bytes != null && torrentStats.total_bytes > 0)) && (
          <div className="mt-6 w-full max-w-xs space-y-2">
            {(torrentStats.progress != null ||
              (downloadedFormatted != null && totalFormatted != null)) && (
              <>
                <div className="flex justify-between text-sm text-white/70">
                  <span>{progressPercent}%</span>
                  {downloadedFormatted != null && totalFormatted != null && (
                    <span>{downloadedFormatted} / {totalFormatted}</span>
                  )}
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </>
            )}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/60">
              {downloadSpeedMb != null && Number(downloadSpeedMb) > 0 && (
                <span>{downloadSpeedMb} MB/s</span>
              )}
              {etaFormatted != null && <span>Temps restant {etaFormatted}</span>}
              {(torrentStats.peers_connected != null || torrentStats.peers_total != null) && (
                <span>
                  Peers {torrentStats.peers_connected ?? 0} / {torrentStats.peers_total ?? 0}
                </span>
              )}
              {(torrentStats.seeders ?? 0) > 0 && <span>Seeders {torrentStats.seeders}</span>}
            </div>
          </div>
        )}

        {/* Indicateur d'étapes — seulement si le téléchargement est en cours (pas pour les fichiers déjà prêts) */}
        {!isCompleted && loadingStep >= 1 && (
          <div className="mt-6 w-full">
            <StreamingStepIndicator
              currentStep={loadingStep}
              progressMessage={progressMessage}
              compact={true}
            />
          </div>
        )}

        {/* Message de progression pour fichiers complétés (préparation du transcodage HLS) */}
        {isCompleted && progressMessage && (
          <p className="text-white/50 text-sm mt-4 font-light">{progressMessage}</p>
        )}

        {/* Bouton Annuler/Fermer */}
        {onCancel && (
          <div className="mt-8">
            <button
              type="button"
              onClick={onCancel}
              title={effectiveCancelLabel}
              aria-label={effectiveCancelLabel}
              tabIndex={0}
              data-focusable
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-black min-h-[44px] min-w-[44px] transition-colors"
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
              {effectiveCancelLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
