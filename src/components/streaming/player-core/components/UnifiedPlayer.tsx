import HLSPlayer from '../../hls-player/HLSPlayer';
import type { HLSPlayerProps } from '../../hls-player/types';
import DirectVideoPlayer from './DirectVideoPlayer';
import PlayerLoadingOverlay from './PlayerLoadingOverlay';

interface UnifiedPlayerProps {
  src: string | null;
  useDirectPlayer: boolean;
  loading: boolean;
  loadingMessage: string;
  closeLabel: string;
  onClose: () => void;
  onDirectError: (event: Event) => void;
  onDirectLoadedData: () => void;
  hlsProps: Omit<HLSPlayerProps, 'src'>;
  onHlsError: (error: Error) => void;
  onHlsLoadingChange: (loading: boolean) => void;
}

export default function UnifiedPlayer({
  src,
  useDirectPlayer,
  loading,
  loadingMessage,
  closeLabel,
  onClose,
  onDirectError,
  onDirectLoadedData,
  hlsProps,
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
