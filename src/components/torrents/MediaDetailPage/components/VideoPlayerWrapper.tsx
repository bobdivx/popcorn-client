import { useState, useEffect, useRef } from 'preact/hooks';
import HLSPlayer from '../../../streaming/hls-player/HLSPlayer';
import { webtorrentClient } from '../../../../lib/torrent/webtorrent-client';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/hls-player/hooks/useFullscreen';

interface VideoPlayerWrapperProps {
  infoHash: string;
  selectedFile?: TorrentFile;
  torrentName: string;
  torrentId?: string;
  startFromBeginning?: boolean;
  onClose: () => void;
  visible?: boolean;
  wrapperRef?: (element: HTMLDivElement | null) => void;
}

export function VideoPlayerWrapper({ 
  infoHash, 
  selectedFile, 
  torrentName, 
  torrentId, 
  startFromBeginning = false, 
  onClose, 
  visible = true, 
  wrapperRef 
}: VideoPlayerWrapperProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const isFullscreen = useFullscreen();
  const wrapperElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wrapperRef) {
      wrapperRef(wrapperElementRef.current);
    }
  }, [wrapperRef]);

  useEffect(() => {
    if (!selectedFile || !infoHash) return;

    const loadBlobUrl = async () => {
      try {
        setIsLoading(true);
        const files = webtorrentClient.getTorrentFiles(infoHash);
        const fileIndex = files.findIndex(f => (f.path || f.name) === selectedFile.path || f.name === selectedFile.name);
        
        if (fileIndex === -1) {
          console.error('Fichier non trouvé dans le torrent');
          setIsLoading(false);
          return;
        }

        const url = await webtorrentClient.createBlobUrl(infoHash, fileIndex);
        if (url) {
          setBlobUrl(url);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Erreur lors de la création de la Blob URL:', error);
        setIsLoading(false);
      }
    };

    loadBlobUrl();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
    };
  }, [selectedFile, infoHash]);

  if (!selectedFile) {
    return (
      <div 
        ref={wrapperElementRef}
        id="video-player-wrapper" 
        className="fixed inset-0 z-50 bg-black w-full h-full"
        style={{
          ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
          display: visible ? 'block' : 'none',
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30">
          <div className="text-center">
            <div className="relative w-24 h-24 mb-6 mx-auto">
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-white/80 text-lg">Chargement des fichiers vidéo...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={wrapperElementRef}
      id="video-player-wrapper" 
      className="fixed inset-0 z-50 bg-black w-full h-full"
      style={{
        ...(isFullscreen ? { width: '100vw', height: '100vh' } : {}),
        display: visible ? 'block' : 'none',
        transform: 'translateZ(0)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
    >
      {!isFullscreen && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 text-white hover:text-white/80 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Fermer
          </button>
        </div>
      )}

      <div 
        className={`absolute inset-0 ${isFullscreen ? 'p-0' : 'pt-16 pb-8 px-4 sm:px-6 lg:px-8'}`}
      >
        <div 
          className={`h-full w-full ${isFullscreen ? '' : 'max-w-7xl mx-auto'} flex flex-col relative`}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30">
              <div className="text-center">
                <div className="relative w-24 h-24 mb-6 mx-auto">
                  <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-white/80 text-lg">Chargement de la vidéo...</p>
              </div>
            </div>
          )}
          
          {blobUrl && (
            <HLSPlayer
              src={blobUrl}
              infoHash={infoHash}
              fileName={selectedFile.path || selectedFile.name}
              torrentName={torrentName || selectedFile.name}
              torrentId={torrentId}
              filePath={selectedFile.path || selectedFile.name}
              startFromBeginning={startFromBeginning}
              onLoadingChange={(loading) => {
                setIsLoading(loading);
              }}
              onError={(e) => {
                console.error('[VideoPlayerWrapper] HLS Player error:', e);
                setIsLoading(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
