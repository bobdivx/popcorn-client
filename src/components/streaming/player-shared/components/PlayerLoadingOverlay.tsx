import { useI18n } from '../../../../lib/i18n/useI18n';
import { StreamingStepIndicator } from './StreamingStepIndicator';
import { PlayerOverlayChrome } from './PlayerOverlayChrome';
import { TorrentStatsBlock } from './TorrentStatsBlock';
import { deriveTorrentOverlayStats } from './playerOverlayStats';

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
  const derived = deriveTorrentOverlayStats(torrentStats);

  const stateLabel = derived.isCompleted
    ? t('playback.preparingStream') || 'Préparation du flux…'
    : torrentStats?.state === 'queued'
      ? t('playback.queued') || "En file d'attente"
      : torrentStats?.state === 'downloading' || derived.isActivelyDownloading
        ? t('playback.downloading') || 'Téléchargement en cours'
        : message;

  const effectiveCancelLabel = derived.isCompleted
    ? closeLabel
    : cancelLabel || defaultCancelLabel;

  return (
    <PlayerOverlayChrome onClose={onCancel} closeLabel={effectiveCancelLabel}>
      {title && (
        <h2 className="text-white text-xl sm:text-2xl font-semibold tracking-tight mb-4 line-clamp-2 px-2">
          {title}
        </h2>
      )}

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

      {torrentStats && <TorrentStatsBlock torrentStats={torrentStats} variant="plain" barTone="primary" />}

      {!derived.isCompleted && loadingStep >= 1 && (
        <div className="mt-6 w-full">
          <StreamingStepIndicator
            currentStep={loadingStep}
            progressMessage={progressMessage}
            compact={true}
          />
        </div>
      )}

      {derived.isCompleted && progressMessage && (
        <p className="text-white/50 text-sm mt-4 font-light">{progressMessage}</p>
      )}
    </PlayerOverlayChrome>
  );
}
