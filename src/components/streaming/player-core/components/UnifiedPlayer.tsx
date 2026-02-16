import HLSPlayer from '../../hls-player/HLSPlayer';
import type { HLSPlayerProps } from '../../hls-player/types';
import LuciePlayer from '../../lucie-player/LuciePlayer';
import type { LuciePlayerProps } from '../../lucie-player/types';
import DirectVideoPlayer from '../../direct-player/DirectVideoPlayer';
import PlayerLoadingOverlay from '../../player-shared/components/PlayerLoadingOverlay';

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
  closeLabel: string;
  onClose: () => void;
  onDirectError: (event: Event) => void;
  onDirectLoadedData: () => void;
  hlsProps: Omit<HLSPlayerProps, 'src'>;
  lucieProps?: Omit<LuciePlayerProps, 'src'>; // Nouveau: props pour Lucie
  onHlsError: (error: Error) => void;
  onHlsLoadingChange: (loading: boolean) => void;
}

export default function UnifiedPlayer({
  src,
  useDirectPlayer,
  useLuciePlayer = false,
  loading,
  loadingMessage,
  closeLabel,
  onClose,
  onDirectError,
  onDirectLoadedData,
  hlsProps,
  lucieProps,
  onHlsError,
  onHlsLoadingChange,
}: UnifiedPlayerProps) {
  return (
    <>
      {loading && <PlayerLoadingOverlay message={loadingMessage} />}

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
        />
      ) : src && useLuciePlayer && lucieProps ? (
        <LuciePlayer
          src={src}
          {...lucieProps}
          onLoadingChange={onHlsLoadingChange}
          onError={onHlsError}
        />
      ) : src ? (
        <HLSPlayer
          src={src}
          {...hlsProps}
          onLoadingChange={onHlsLoadingChange}
          onError={onHlsError}
        />
      ) : null}
    </>
  );
}
