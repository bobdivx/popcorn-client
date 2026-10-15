import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useHlsLoader } from './streaming/hls-player/hooks/useHlsLoader';
import { serverApi } from '../lib/client/server-api';
import { resolveBootIntroMp4 } from '../lib/utils/boot-intro';

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

  const introSrc =
    typeof window !== 'undefined'
      ? resolveBootIntroMp4(window.location.protocol)
      : resolveBootIntroMp4();

  useEffect(() => {
    const skipTimer = setTimeout(() => {
      setShowSkip(true);
    }, 1800);

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

  const introFinishedRef = useRef(false);
  const completeIntro = useCallback(() => {
    if (introFinishedRef.current) return;
    introFinishedRef.current = true;
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
      } catch (e) {
        console.warn('[IntroVideoWithHlsPreload] Erreur lors de l\'arrêt du préchargement:', e);
      }
    }
    onEnded();
  }, [onEnded]);

  // Garde-fous : jamais bloqué sur l'intro.
  // - pas de lecture effective en 8 s → on passe ;
  // - sinon, fin forcée à durée + 1,5 s (si `ended` ne se déclenche pas).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const v = videoRef.current;
      if (introFinishedRef.current) return;
      if (!v || v.paused || v.readyState < 2 || v.currentTime < 0.25) {
        console.warn('[IntroVideoWithHlsPreload] Intro non lue après 8 s, passage automatique');
        completeIntro();
        return;
      }
      const remaining = Number.isFinite(v.duration) ? Math.max(0, v.duration - v.currentTime) : 10;
      window.setTimeout(() => completeIntro(), Math.min(remaining, 20) * 1000 + 1500);
    }, 8000);
    return () => window.clearTimeout(t);
  }, [completeIntro]);

  // Retour / Escape uniquement (pas OK global — évite le piège télécommande Netflix-like).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const code = e.keyCode ?? e.which;
      const isBack =
        e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' ||
        code === 27 || code === 461 || code === 10009 || code === 8;
      if (!isBack) return;
      e.preventDefault();
      e.stopPropagation();
      completeIntro();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [completeIntro]);

  const skipBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" data-intro-variant="brand">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={completeIntro}
        onError={() => {
          console.warn('[IntroVideoWithHlsPreload] Erreur vidéo intro (fichier ou codec), passage automatique');
          completeIntro();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      >
        <source src={introSrc} type="video/mp4" />
      </video>

      {showSkip && (
        <button
          type="button"
          ref={skipBtnRef}
          onClick={completeIntro}
          data-focusable
          tabIndex={0}
          className="ed-cta absolute bottom-8 right-8 z-10 flex items-center gap-2"
          aria-label="Passer l'intro"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Passer
        </button>
      )}

      {hlsInfoHash && hlsPreloadStatus && (
        <div className="absolute top-4 left-4 px-4 py-2 bg-black/70 text-white text-sm rounded-lg backdrop-blur-sm border border-white/20 opacity-75">
          {hlsPreloadStatus}
        </div>
      )}
    </div>
  );
}
