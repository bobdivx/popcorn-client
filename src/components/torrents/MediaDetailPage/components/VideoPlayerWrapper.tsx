import { useState, useEffect, useRef } from 'preact/hooks';
import HLSPlayer from '../../../streaming/hls-player/HLSPlayer';
import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/hls-player/hooks/useFullscreen';
import { QualityBadges } from './QualityBadges';

interface VideoPlayerWrapperProps {
  infoHash: string;
  selectedFile?: TorrentFile;
  torrentName: string;
  torrentId?: string;
  startFromBeginning?: boolean;
  onClose: () => void;
  visible?: boolean;
  wrapperRef?: (element: HTMLDivElement | null) => void;
  quality?: {
    resolution?: string;
    source?: string;
    codec?: string;
    audio?: string;
    language?: string;
    full?: string;
  };
}

export function VideoPlayerWrapper({ 
  infoHash, 
  selectedFile, 
  torrentName, 
  torrentId, 
  startFromBeginning = false, 
  onClose, 
  visible = true, 
  wrapperRef,
  quality
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

    const loadHlsUrl = async () => {
      try {
        setIsLoading(true);
        // Utiliser l'URL HLS du backend au lieu d'une Blob URL
        const baseUrl = serverApi.getServerUrl();
        // Encoder le chemin du fichier pour l'URL
        // Le backend attend /api/local/stream/{filePath}/playlist.m3u8
        // Utiliser le chemin complet du fichier (qui inclut le chemin relatif dans le torrent)
        // Normaliser le chemin : remplacer les backslashes par des slashes pour l'URL
        const filePath = selectedFile.path || selectedFile.name;
        const normalizedPath = filePath.replace(/\\/g, '/');
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VideoPlayerWrapper.tsx:62',message:'Construction URL HLS - avant encodage',data:{filePath,normalizedPath,name:selectedFile.name,path:selectedFile.path,infoHash:infoHash?.substring(0,12)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.log('[VideoPlayerWrapper] Construction URL HLS:', {
          filePath,
          normalizedPath,
          name: selectedFile.name,
          path: selectedFile.path,
          infoHash,
        });
        const encodedPath = encodeURIComponent(normalizedPath);
        // Passer l'info_hash en query parameter pour que le backend puisse utiliser get_file_path
        // qui utilise le download_path depuis la DB ou le handle (plus fiable que la recherche dans les dossiers)
        const infoHashParam = infoHash ? `?info_hash=${encodeURIComponent(infoHash)}` : '';
        const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8${infoHashParam}`;
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'VideoPlayerWrapper.tsx:72',message:'URL HLS construite',data:{encodedPath,hlsUrl,normalizedPath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.log('[VideoPlayerWrapper] URL HLS construite:', hlsUrl);
        setBlobUrl(hlsUrl);
        setIsLoading(false);
      } catch (error) {
        console.error('Erreur lors de la création de l\'URL HLS:', error);
        setIsLoading(false);
      }
    };

    loadHlsUrl();
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
              <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
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
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 text-white hover:text-white/80 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Fermer
            </button>
            
            {/* Badges de qualité en haut à droite */}
            <QualityBadges quality={quality} align="right" />
          </div>
        </div>
      )}
      
      {/* Badges de qualité en plein écran aussi */}
      {isFullscreen && (
        <div className="absolute top-4 right-4 z-20">
          <QualityBadges quality={quality} align="right" />
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
