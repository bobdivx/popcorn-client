import HLSPlayer from '../../hls-player/HLSPlayer';
import type { HLSPlayerProps } from '../../hls-player/types';
import LuciePlayer from '../../lucie-player/LuciePlayer';
import type { LuciePlayerProps } from '../../lucie-player/types';
import DirectVideoPlayer from '../../direct-player/DirectVideoPlayer';
import PlayerLoadingOverlay, {
  type PlayerLoadingTorrentStats,
} from '../../player-shared/components/PlayerLoadingOverlay';

/**
 * Façade unique du lecteur (direct, HLS ou Lucie).
 * Les politiques seek/buffer/source sont injectées via hlsProps/lucieProps (canUseSeekReload, baseUrl, stopBufferRef).
 */
interface UnifiedPlayerProps {
  src: string | null;
  useDirectPlayer: boolean;
  useLuciePlayer?: boolean; // Nouveau: utiliser le lecteur Lucie
  loading: boolean;
  loadingMessage: string;
  /** Étape (1-4) pour l'indicateur d'étapes streaming dans l'overlay. */
  loadingStep?: number;
  /** Message de détail (ex. "Recherche de peers...") pour l'overlay. */
  progressMessage?: string;
  /** Stats du client torrent pour affichage en temps réel dans l'overlay. */
  torrentStats?: PlayerLoadingTorrentStats | null;
  closeLabel: string;
  /** Libellé du bouton Annuler dans l'overlay de chargement (télécommande). */
  cancelLabel?: string;
  onClose: () => void;
  onDirectError: (event: Event) => void;
  onDirectLoadedData: () => void;
  hlsProps: Omit<HLSPlayerProps, 'src'>;
  lucieProps?: Omit<LuciePlayerProps, 'src'>; // Nouveau: props pour Lucie
  onHlsError: (error: Error) => void;
  onHlsLoadingChange: (loading: boolean) => void;
  /** Appelé périodiquement et à la fermeture avec la progression (pour Reprendre / Revoir). */
  onProgress?: (currentTime: number, duration: number) => void;
}

export default function UnifiedPlayer({
  src,
  useDirectPlayer,
  useLuciePlayer = false,
  loading,
  loadingMessage,
  loadingStep = 0,
  progressMessage,
  torrentStats,
  closeLabel,
  cancelLabel,
  onClose,
  onDirectError,
  onDirectLoadedData,
  hlsProps,
  lucieProps,
  onHlsError,
  onHlsLoadingChange,
  onProgress,
}: UnifiedPlayerProps) {
  return (
    <>
      {loading && (
        <PlayerLoadingOverlay
          message={loadingMessage}
          loadingStep={loadingStep}
          progressMessage={progressMessage}
          torrentStats={torrentStats}
          onCancel={onClose}
          cancelLabel={cancelLabel ?? closeLabel}
        />
      )}

      {src && useDirectPlayer ? (
        <DirectVideoPlayer
          src={src}
          closeLabel={closeLabel}
          onClose={onClose}
          onLoadedData={onDirectLoadedData}
          onError={onDirectError}
          loading={loading}
          loadingMessage={loadingMessage}
          posterUrl={hlsProps.posterUrl}
          logoUrl={hlsProps.logoUrl}
          synopsis={hlsProps.synopsis}
          releaseDate={hlsProps.releaseDate}
          torrentName={hlsProps.torrentName ?? hlsProps.fileName}
          torrentStats={torrentStats}
          onProgress={onProgress}
          scrubThumbnails={(hlsProps as any).scrubThumbnails ?? null}
        />
      ) : src && useLuciePlayer && lucieProps ? (
        <LuciePlayer
          src={src}
          {...lucieProps}
          onLoadingChange={onHlsLoadingChange}
          onError={onHlsError}
          onProgress={onProgress}
        />
      ) : src ? (
        <HLSPlayer
          src={src}
          {...hlsProps}
          onLoadingChange={onHlsLoadingChange}
          onError={onHlsError}
          onProgress={onProgress}
        />
      ) : null}
    </>
  );
}
