import { useEffect, useRef, useState } from 'preact/hooks';
import { useHlsLoader } from './streaming/hls-player/hooks/useHlsLoader';
import { serverApi } from '../lib/client/server-api';

interface IntroVideoWithHlsPreloadProps {
  onEnded: () => void;
  onSkip?: () => void;
  // Paramètres HLS pour précharger la playlist
  hlsInfoHash?: string;
  hlsFilePath?: string;
  hlsFileName?: string;
  /** URL de la playlist HLS (ex. proxy pour bibliothèque partagée). Si fournie, utilisée telle quelle. */
  hlsStreamUrl?: string | null;
  onHlsReady?: (hlsInstance: any) => void;
}

export default function IntroVideoWithHlsPreload({
  onEnded,
  onSkip,
  hlsInfoHash,
  hlsFilePath,
  hlsFileName,
  hlsStreamUrl,
  onHlsReady,
}: IntroVideoWithHlsPreloadProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [hlsPreloadStatus, setHlsPreloadStatus] = useState<string>('');
  const { hlsLoaded } = useHlsLoader();

  useEffect(() => {
    // Afficher le bouton skip après 2 secondes
    const skipTimer = setTimeout(() => {
      setShowSkip(true);
    }, 2000);

    // Démarrer la lecture automatiquement
    const video = videoRef.current;
    if (video) {
      video.play().catch((error) => {
        console.warn('Erreur lors de la lecture automatique:', error);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }

    return () => {
      clearTimeout(skipTimer);
    };
  }, []);

  // Précharger la playlist HLS en arrière-plan
  useEffect(() => {
    if (!hlsLoaded || !hlsInfoHash || !hlsFilePath || !window.Hls) {
      return;
    }

    const preloadHls = async () => {
      try {
        setHlsPreloadStatus('Préchargement de la playlist...');
        const baseUrl = serverApi.getServerUrl();
        const normalizedPath = hlsFilePath.replace(/\\/g, '/');
        const encodedPath = encodeURIComponent(normalizedPath);
        const hlsUrl = (hlsStreamUrl && hlsStreamUrl.trim()) || `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?info_hash=${encodeURIComponent(hlsInfoHash)}`;

        console.log('[IntroVideoWithHlsPreload] Préchargement HLS:', {
          hlsUrl,
          infoHash: hlsInfoHash,
          filePath: hlsFilePath,
        });

        // Créer une vidéo invisible pour précharger la playlist HLS
        const backgroundVideo = document.createElement('video');
        backgroundVideo.style.display = 'none';
        backgroundVideo.muted = true;
        backgroundVideo.playsInline = true;
        backgroundVideoRef.current = backgroundVideo;
        document.body.appendChild(backgroundVideo);

        // Créer une instance HLS pour précharger
        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 60, // Buffer plus long pour le préchargement
          maxMaxBufferLength: 120,
          maxBufferSize: 100 * 1000 * 1000, // 100 MB
          // Configuration pour précharger sans jouer
          startLevel: -1, // Auto
          autoStartLoad: true,
        });

        hlsRef.current = hls;

        // Charger la source HLS
        hls.loadSource(hlsUrl);
        hls.attachMedia(backgroundVideo);

        // Écouter les événements HLS pour suivre le préchargement
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          setHlsPreloadStatus('Playlist chargée, buffering...');
          console.log('[IntroVideoWithHlsPreload] Manifest HLS parsé, début du buffering');
          
          // Démarrer le buffering sans jouer
          hls.startLoad();
          
          // Notifier que HLS est prêt
          if (onHlsReady) {
            onHlsReady(hls);
          }
        });

        hls.on(window.Hls.Events.LEVEL_LOADED, () => {
          setHlsPreloadStatus('Playlist prête');
          console.log('[IntroVideoWithHlsPreload] Niveau HLS chargé');
        });

        hls.on(window.Hls.Events.FRAG_LOADED, () => {
          // Fragments chargés en arrière-plan
          // Ne pas mettre à jour le statut à chaque fragment pour éviter le spam
        });

        hls.on(window.Hls.Events.ERROR, (event: any, data: any) => {
          if (data.fatal) {
            console.warn('[IntroVideoWithHlsPreload] Erreur HLS (non bloquante pour l\'intro):', data);
            setHlsPreloadStatus('Erreur de préchargement (non bloquant)');
          }
        });

        // Nettoyage
        return () => {
          if (hlsRef.current) {
            try {
              hlsRef.current.destroy();
            } catch (e) {
              console.warn('[IntroVideoWithHlsPreload] Erreur lors de la destruction HLS:', e);
            }
            hlsRef.current = null;
          }
          if (backgroundVideoRef.current && backgroundVideoRef.current.parentNode) {
            backgroundVideoRef.current.parentNode.removeChild(backgroundVideoRef.current);
            backgroundVideoRef.current = null;
          }
        };
      } catch (error) {
        console.warn('[IntroVideoWithHlsPreload] Erreur lors du préchargement HLS:', error);
        setHlsPreloadStatus('Erreur de préchargement');
      }
    };

    preloadHls();

    // Nettoyage au démontage
    return () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch (e) {
          console.warn('[IntroVideoWithHlsPreload] Erreur lors du cleanup HLS:', e);
        }
        hlsRef.current = null;
      }
      if (backgroundVideoRef.current && backgroundVideoRef.current.parentNode) {
        backgroundVideoRef.current.parentNode.removeChild(backgroundVideoRef.current);
        backgroundVideoRef.current = null;
      }
    };
  }, [hlsLoaded, hlsInfoHash, hlsFilePath, onHlsReady]);

  const handleEnded = () => {
    // Arrêter le préchargement HLS si nécessaire
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
      } catch (e) {
        console.warn('[IntroVideoWithHlsPreload] Erreur lors de l\'arrêt du préchargement:', e);
      }
    }
    onEnded();
  };

  const handleSkip = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    // Arrêter le préchargement HLS si nécessaire
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
      } catch (e) {
        console.warn('[IntroVideoWithHlsPreload] Erreur lors de l\'arrêt du préchargement:', e);
      }
    }
    onEnded();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Message explicatif en haut */}
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 max-w-2xl mx-4">
        <div className="bg-black/80 backdrop-blur-md border border-white/30 rounded-xl p-4 text-center">
          <h2 className="text-xl font-bold text-white mb-2">
            Bienvenue dans Popcorn
          </h2>
          <p className="text-gray-300 text-sm">
            Découvrez rapidement les fonctionnalités de l'application. Vous pouvez passer cette vidéo à tout moment.
          </p>
        </div>
      </div>

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source src="/intro.mp4" type="video/mp4" />
        Votre navigateur ne supporte pas la lecture de vidéos.
      </video>
      
      {/* Bouton Passer - Plus visible et toujours accessible */}
      <div className="absolute bottom-8 right-8 z-10 flex flex-col items-end gap-3">
        {showSkip && (
          <button
            onClick={handleSkip}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-all duration-300 shadow-lg border-2 border-primary-500 flex items-center gap-2"
            aria-label="Passer l'intro"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Passer l'introduction
          </button>
        )}
        {!showSkip && (
          <div className="px-4 py-2 bg-black/70 backdrop-blur-sm border border-white/20 rounded-lg text-white text-sm">
            Le bouton "Passer" apparaîtra dans quelques secondes...
          </div>
        )}
      </div>

      {/* Indicateur de préchargement HLS (optionnel, peut être masqué) */}
      {hlsInfoHash && hlsPreloadStatus && (
        <div className="absolute top-4 left-4 px-4 py-2 bg-black/70 text-white text-sm rounded-lg backdrop-blur-sm border border-white/20 opacity-75">
          {hlsPreloadStatus}
        </div>
      )}
    </div>
  );
}
