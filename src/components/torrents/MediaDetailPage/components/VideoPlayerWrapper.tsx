import { useState, useEffect, useRef } from 'preact/hooks';
import HLSPlayer from '../../../streaming/hls-player/HLSPlayer';
import { serverApi } from '../../../../lib/client/server-api';
import type { TorrentFile } from '../hooks/useVideoFiles';
import { useFullscreen } from '../../../streaming/hls-player/hooks/useFullscreen';
import { QualityBadges } from './QualityBadges';
import { isMobileDevice } from '../../../../lib/utils/device-detection';
import IntroVideoWithHlsPreload from '../../../IntroVideoWithHlsPreload';
import PrerollPlayer from '../../../streaming/hls-player/components/PrerollPlayer';
import { getPublicAdsSettings, type AdsConfig } from '../../../../lib/api/popcorn-web';
import { useHlsLoader } from '../../../streaming/hls-player/hooks/useHlsLoader';
import { useI18n } from '../../../../lib/i18n/useI18n';

/** Info épisode suivant (série) pour le bouton « Épisode suivant » */
export interface NextEpisodeInfo {
  seasonNum: number;
  episodeVariantId: string;
  title?: string;
}

interface VideoPlayerWrapperProps {
  infoHash: string;
  selectedFile?: TorrentFile;
  torrentName: string;
  torrentId?: string;
  startFromBeginning?: boolean;
  /** Contexte série : afficher « Passer le générique » et appliquer auto-skip si activé */
  isSeries?: boolean;
  /** Épisode suivant (série) : afficher bouton « Épisode suivant » peu avant la fin */
  nextEpisodeInfo?: NextEpisodeInfo | null;
  onPlayNextEpisode?: () => void;
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
  /** En mode démo : URL directe du MP4 (ex. popcorn-web/public/media), pour lecture sans HLS. */
  directStreamUrl?: string | null;
}

export function VideoPlayerWrapper({ 
  infoHash, 
  selectedFile, 
  torrentName, 
  torrentId, 
  startFromBeginning = false, 
  isSeries = false,
  nextEpisodeInfo,
  onPlayNextEpisode,
  onClose, 
  visible = true, 
  wrapperRef,
  quality,
  directStreamUrl,
}: VideoPlayerWrapperProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [showPreroll, setShowPreroll] = useState(false);
  const [adsConfig, setAdsConfig] = useState<AdsConfig | null>(null);
  const [hlsFilePath, setHlsFilePath] = useState<string | null>(null);
  const hlsPreloadRef = useRef<any>(null);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);
  const { hlsLoaded } = useHlsLoader();
  const isFullscreen = useFullscreen();
  const wrapperElementRef = useRef<HTMLDivElement>(null);
  const isMobile = isMobileDevice();
  const { t } = useI18n();
  
  // Constantes pour contrôler l'affichage de l'intro
  const STORAGE_INTRO_ALWAYS_SHOW = 'popcorn_intro_always_show';
  const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';
  const STORAGE_ADS_SESSION = 'popcorn_ads_preroll_session';
  const STORAGE_ADS_DAY = 'popcorn_ads_preroll_day';

  useEffect(() => {
    if (wrapperRef) {
      wrapperRef(wrapperElementRef.current);
    }
  }, [wrapperRef]);

  // Arrêter le buffer HLS lors de la fermeture du lecteur
  useEffect(() => {
    if (!visible) {
      // Arrêter le buffer quand le lecteur est fermé
      const stopBuffer = (window as any).__hlsPlayerStopBuffer;
      if (stopBuffer && typeof stopBuffer === 'function') {
        try {
          stopBuffer();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer:', e);
        }
      }
    }
  }, [visible]);

  // Arrêter le buffer lors du démontage du composant
  useEffect(() => {
    return () => {
      const stopBuffer = (window as any).__hlsPlayerStopBuffer;
      if (stopBuffer && typeof stopBuffer === 'function') {
        try {
          stopBuffer();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur lors de l\'arrêt du buffer au démontage:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    // Mode démo : URL directe du MP4 (pas de HLS)
    if (directStreamUrl) {
      setBlobUrl(directStreamUrl);
      setHlsFilePath('direct');
      setIsLoading(false);
      return;
    }

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
        setHlsFilePath(normalizedPath);
        setIsLoading(false);
        
        // Vérifier si l'intro doit être affichée
        // Option 1: Toujours afficher (si STORAGE_INTRO_ALWAYS_SHOW = '1')
        // Option 2: Seulement la première fois (si STORAGE_INTRO_SKIPPED n'est pas '1')
        try {
          const alwaysShow = localStorage.getItem(STORAGE_INTRO_ALWAYS_SHOW) === '1';
          const introSkipped = localStorage.getItem(STORAGE_INTRO_SKIPPED) === '1';
          
          if (alwaysShow || !introSkipped) {
            // Afficher l'intro avec préchargement HLS avant de jouer la vidéo
            setShowIntro(true);
          }
        } catch (e) {
          // En cas d'erreur localStorage, afficher l'intro par défaut
          console.warn('[VideoPlayerWrapper] Erreur localStorage, affichage intro par défaut:', e);
          setShowIntro(true);
        }
      } catch (error) {
        console.error('[VideoPlayerWrapper] Erreur lors de la création de l\'URL HLS:', error);
        setIsLoading(false);
      }
    };

    loadHlsUrl();
  }, [selectedFile, infoHash, directStreamUrl]);

  useEffect(() => {
    let mounted = true;
    const serverUrl = serverApi.getServerUrl();
    getPublicAdsSettings(serverUrl)
      .then((cfg) => {
        if (mounted) setAdsConfig(cfg);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (directStreamUrl) return; // Lecture directe MP4 (démo), pas de HLS
    if (!showPreroll || showIntro) return;
    if (!hlsLoaded || !infoHash || !hlsFilePath || !window.Hls) return;

    const preloadHls = () => {
      try {
        const baseUrl = serverApi.getServerUrl();
        const normalizedPath = hlsFilePath.replace(/\\/g, '/');
        const encodedPath = encodeURIComponent(normalizedPath);
        const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?info_hash=${encodeURIComponent(infoHash)}`;

        const backgroundVideo = document.createElement('video');
        backgroundVideo.style.display = 'none';
        backgroundVideo.muted = true;
        backgroundVideo.playsInline = true;
        preloadVideoRef.current = backgroundVideo;
        document.body.appendChild(backgroundVideo);

        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 10,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          startLevel: -1,
          autoStartLoad: true,
        });

        hlsPreloadRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(backgroundVideo);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          hls.startLoad();
        });
      } catch (e) {
        console.warn('[VideoPlayerWrapper] Erreur préchargement HLS pré‑roll:', e);
      }
    };

    preloadHls();

    return () => {
      if (hlsPreloadRef.current) {
        try {
          hlsPreloadRef.current.stopLoad();
          hlsPreloadRef.current.destroy();
        } catch (e) {
          console.warn('[VideoPlayerWrapper] Erreur nettoyage HLS pré‑roll:', e);
        }
        hlsPreloadRef.current = null;
      }
      if (preloadVideoRef.current && preloadVideoRef.current.parentNode) {
        preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        preloadVideoRef.current = null;
      }
    };
  }, [showPreroll, showIntro, hlsLoaded, infoHash, hlsFilePath, directStreamUrl]);

  useEffect(() => {
    if (!adsConfig || !selectedFile || !infoHash) return;
    if (showIntro) return;

    const hasMedia =
      (adsConfig.type === 'image' && !!adsConfig.imageUrl) ||
      (adsConfig.type === 'video' && !!adsConfig.videoUrl) ||
      (adsConfig.type === 'google' && !!adsConfig.googleAdTagUrl);

    if (!adsConfig.enabled || !hasMedia) return;

    const today = new Date().toISOString().slice(0, 10);
    let shouldShow = true;
    try {
      if (adsConfig.frequency === 'once_per_session') {
        shouldShow = sessionStorage.getItem(STORAGE_ADS_SESSION) !== '1';
      } else if (adsConfig.frequency === 'once_per_day') {
        shouldShow = localStorage.getItem(STORAGE_ADS_DAY) !== today;
      }
    } catch (e) {
      shouldShow = true;
    }

    if (shouldShow) {
      setShowPreroll(true);
    }
  }, [adsConfig, selectedFile, infoHash, showIntro]);

  const markPrerollSeen = () => {
    if (!adsConfig) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (adsConfig.frequency === 'once_per_session') {
        sessionStorage.setItem(STORAGE_ADS_SESSION, '1');
      } else if (adsConfig.frequency === 'once_per_day') {
        localStorage.setItem(STORAGE_ADS_DAY, today);
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  // Afficher l'intro avec préchargement HLS si nécessaire (pas en mode lecture directe / démo)
  if (!directStreamUrl && showIntro && selectedFile && hlsFilePath && infoHash) {
    return (
      <IntroVideoWithHlsPreload
        onEnded={() => {
          // Marquer l'intro comme vue (seulement si on n'est pas en mode "toujours afficher")
          try {
            const alwaysShow = localStorage.getItem(STORAGE_INTRO_ALWAYS_SHOW) === '1';
            if (!alwaysShow) {
              localStorage.setItem(STORAGE_INTRO_SKIPPED, '1');
            }
          } catch (e) {
            console.warn('[VideoPlayerWrapper] Erreur localStorage:', e);
          }
          setShowIntro(false);
        }}
        hlsInfoHash={infoHash}
        hlsFilePath={hlsFilePath}
        hlsFileName={selectedFile.name}
        onHlsReady={(hlsInstance) => {
          console.log('[VideoPlayerWrapper] HLS préchargé et prêt:', hlsInstance);
        }}
      />
    );
  }

  if (showPreroll && adsConfig) {
    return (
      <PrerollPlayer
        config={adsConfig}
        onEnded={() => {
          markPrerollSeen();
          setShowPreroll(false);
        }}
        onSkip={() => {
          markPrerollSeen();
          setShowPreroll(false);
        }}
      />
    );
  }

  if (!selectedFile && !directStreamUrl) {
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
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <div className="text-center">
            <div className="relative w-32 h-32 mb-6 mx-auto">
              {/* Cercle de chargement externe */}
              <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"
              ></div>
              {/* Logo Popcorn avec animation pulse */}
              <div className="absolute inset-2 flex items-center justify-center animate-pulse">
                <img 
                  src="/popcorn_logo.png" 
                  alt="Popcorn" 
                  className="w-full h-full object-contain"
                  style={{
                    filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
                  }}
                />
              </div>
            </div>
            <p className="text-white/80 text-lg font-medium">Chargement des fichiers vidéo...</p>
            {/* Points animés */}
            <div className="flex gap-1 mt-2 justify-center">
              <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
              <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
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
      {/* Badges de qualité en haut à droite (mode non plein écran) */}
      {!isFullscreen && (
        <div className="absolute top-4 right-4 z-10">
          <QualityBadges quality={quality} align="right" />
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
            <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
              <div className="text-center">
                <div className="relative w-32 h-32 mb-6 mx-auto">
                  {/* Cercle de chargement externe */}
                  <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
                  <div 
                    className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"
                  ></div>
                  {/* Logo Popcorn avec animation pulse */}
                  <div className="absolute inset-2 flex items-center justify-center animate-pulse">
                    <img 
                      src="/popcorn_logo.png" 
                      alt="Popcorn" 
                      className="w-full h-full object-contain"
                      style={{
                        filter: 'drop-shadow(0 0 10px rgba(220, 38, 38, 0.5))',
                      }}
                    />
                  </div>
                </div>
                <p className="text-white/80 text-lg font-medium">Chargement de la vidéo...</p>
                {/* Points animés */}
                <div className="flex gap-1 mt-2 justify-center">
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            </div>
          )}
          
          {blobUrl && directStreamUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <video
                src={blobUrl}
                className="max-w-full max-h-full w-full h-full object-contain"
                controls
                autoPlay
                playsInline
                onError={(e) => {
                  console.error('[VideoPlayerWrapper] Direct video error:', e);
                  setIsLoading(false);
                }}
                onLoadedData={() => setIsLoading(false)}
              />
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 left-4 z-20 rounded-lg bg-black/60 px-3 py-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label={t('common.close')}
              >
                {t('common.close')}
              </button>
            </div>
          ) : blobUrl ? (
            <HLSPlayer
              src={blobUrl}
              infoHash={infoHash}
              fileName={selectedFile!.path || selectedFile!.name}
              torrentName={torrentName || selectedFile!.name}
              torrentId={torrentId}
              filePath={selectedFile!.path || selectedFile!.name}
              startFromBeginning={startFromBeginning}
              isSeries={isSeries}
              nextEpisodeInfo={nextEpisodeInfo}
              onPlayNextEpisode={onPlayNextEpisode}
              onLoadingChange={(loading) => {
                setIsLoading(loading);
              }}
              onError={(e) => {
                console.error('[VideoPlayerWrapper] HLS Player error:', e);
                setIsLoading(false);
              }}
              onClose={onClose}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
