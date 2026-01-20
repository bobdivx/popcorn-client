import { useState, useEffect, useRef } from 'preact/hooks';
import HLSPlayer from '../../../streaming/hls-player/HLSPlayer';
import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/hls-player/hooks/useFullscreen';
import { QualityBadges } from './QualityBadges';
import { isMobileDevice } from '../../../../lib/utils/device-detection';

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
  const isMobile = isMobileDevice();

  useEffect(() => {
    if (wrapperRef) {
      wrapperRef(wrapperElementRef.current);
    }
  }, [wrapperRef]);

  useEffect(() => {
    if (!selectedFile) {
      console.warn('[VideoPlayerWrapper] Fichier manquant:', {
        hasSelectedFile: !!selectedFile,
        hasInfoHash: !!infoHash,
      });
      return;
    }
    
    if (!infoHash || infoHash.trim().length === 0) {
      console.error('[VideoPlayerWrapper] ❌ InfoHash manquant ou invalide. Impossible de construire l\'URL HLS.', {
        infoHash,
        fileName: selectedFile.name,
        filePath: selectedFile.path,
      });
      setIsLoading(false);
      return;
    }

    const loadHlsUrl = async () => {
      try {
        setIsLoading(true);
        // Utiliser l'URL HLS du backend au lieu d'une Blob URL
        const baseUrl = serverApi.getServerUrl();
        
        // Utiliser le chemin du fichier (path) si disponible, sinon le nom
        // Le path contient le chemin relatif dans le torrent tel que retourné par le backend
        const filePath = selectedFile.path || selectedFile.name;
        
        // Normaliser le chemin : remplacer les backslashes par des slashes pour l'URL
        // Le backend s'attend à recevoir le chemin tel qu'il est dans le torrent
        let normalizedPath = filePath.replace(/\\/g, '/');
        
        // S'assurer que le chemin ne commence pas par un slash (sauf si c'est un chemin absolu)
        if (normalizedPath.startsWith('/') && !normalizedPath.startsWith('//')) {
          normalizedPath = normalizedPath.substring(1);
        }
        
        console.log('[VideoPlayerWrapper] Construction URL HLS:', {
          filePath,
          normalizedPath,
          name: selectedFile.name,
          path: selectedFile.path,
          infoHash: infoHash.substring(0, 12) + '...',
          baseUrl,
        });
        
        // Encoder le chemin pour l'URL (chaque segment doit être encodé séparément pour éviter les problèmes)
        // Utiliser encodeURIComponent sur le chemin normalisé
        const encodedPath = encodeURIComponent(normalizedPath);
        
        // Passer l'info_hash en query parameter pour que le backend puisse utiliser get_file_path
        // qui utilise le download_path depuis la DB ou le handle (plus fiable que la recherche dans les dossiers)
        const infoHashParam = infoHash ? `?info_hash=${encodeURIComponent(infoHash)}` : '';
        const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8${infoHashParam}`;
        
        console.log('[VideoPlayerWrapper] URL HLS construite:', {
          encodedPath,
          hlsUrl,
          normalizedPath,
          infoHash: infoHash.substring(0, 12) + '...',
        });
        
        setBlobUrl(hlsUrl);
        setIsLoading(false);
      } catch (error) {
        console.error('[VideoPlayerWrapper] Erreur lors de la création de l\'URL HLS:', error);
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
        className={`absolute inset-0 ${isFullscreen ? 'p-0' : isMobile ? 'pt-12 pb-1 px-0' : 'pt-16 pb-1 px-1'}`}
      >
        <div 
          className={`h-full w-full flex flex-col relative ${isFullscreen ? '' : 'max-w-[99vw]'}`}
          style={{
            width: '100%',
            height: '100%',
          }}
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
