import { useState, useEffect, useRef } from 'preact/hooks';

interface YouTubeVideoPlayerProps {
  youtubeKey: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  className?: string;
  onEnded?: () => void;
  cover?: boolean;
}

/** Lecteur YouTube identique sur toutes les plateformes. */
export function YouTubeVideoPlayer({
  youtubeKey,
  autoplay = false,
  muted = true,
  loop = false,
  controls = true,
  className = '',
  cover = false,
  onEnded,
}: YouTubeVideoPlayerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setIsLoaded(true);
  }, [youtubeKey]);

  const postToPlayer = (message: unknown) => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow;
    if (!iframe || !win) return;
    // YouTube IFrame API utilise postMessage stringifié (JSON).
    try {
      win.postMessage(typeof message === 'string' ? message : JSON.stringify(message), '*');
    } catch {
      // ignore
    }
  };

  const ensureListening = () => {
    // Active le flux d'événements postMessage (nécessaire sur certaines plateformes)
    // et s'abonne à onStateChange pour recevoir la fin (0).
    postToPlayer({ event: 'listening', id: youtubeKey });
    postToPlayer({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
  };

  // Détection de fin de vidéo via YouTube IFrame API (postMessage)
  useEffect(() => {
    if (!onEnded || loop) return;

    // Guard pour éviter les appels multiples si l'événement est déclenché plusieurs fois
    let ended = false;
    const safeEnded = () => {
      if (ended) return;
      ended = true;
      onEnded();
    };

    /** Détecte fin de lecture dans toutes les formes connues des messages YouTube embed. */
    const looksLikeEnded = (data: any): boolean => {
      if (!data || typeof data !== 'object') return false;
      // onStateChange : info === 0 (ENDED)
      if (data.event === 'onStateChange') {
        const info = data.info;
        if (info === 0 || info === '0') return true;
      }
      // infoDelivery : playerState 0 = ENDED (réponse à getPlayerState ou évènements internes)
      if (data.event === 'infoDelivery' && data.info != null) {
        const info = data.info;
        if (info === 0 || info === '0') return true;
        if (typeof info === 'number' && info === 0) return true;
        if (typeof info === 'object' && (info.playerState === 0 || info.playerState === '0')) return true;
      }
      // Certaines builds envoient playerState à la racine
      if (data.playerState === 0 || data.playerState === '0') return true;
      return false;
    };

    const handleMessage = (e: MessageEvent) => {
      const origin = (e.origin || '').toLowerCase();
      if (!origin.includes('youtube.com') && !origin.includes('youtube-nocookie.com')) return;

      let data: any;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }

      if (ended) return;
      if (looksLikeEnded(data)) {
        safeEnded();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEnded, loop, youtubeKey]);

  /** Secours : certains navigateurs / TV ne reçoivent pas onStateChange — on interroge getPlayerState (réponses = infoDelivery). */
  useEffect(() => {
    if (!onEnded || loop) return;
    let tick: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      tick = setInterval(() => {
        postToPlayer({ event: 'command', func: 'getPlayerState', args: [] });
      }, 1500);
    };
    const t = window.setTimeout(start, 800);
    return () => {
      clearTimeout(t);
      if (tick) clearInterval(tick);
    };
  }, [onEnded, loop, youtubeKey, isLoaded]);

  // S'assurer qu'on reçoit bien les événements (notamment WebOS)
  useEffect(() => {
    if (!onEnded || loop) return;
    if (!isLoaded) return;
    ensureListening();
  }, [onEnded, loop, youtubeKey, isLoaded]);

  if (!youtubeKey) return null;

  const params = new URLSearchParams();
  if (autoplay) params.append('autoplay', '1');
  if (muted) params.append('mute', '1');
  if (loop) {
    params.append('loop', '1');
    params.append('playlist', youtubeKey);
  }
  if (!controls) params.append('controls', '0');
  // Toujours activer l'API JS si onEnded est fourni (nécessaire pour les postMessage)
  if (onEnded) params.append('enablejsapi', '1');
  params.append('rel', '0');
  params.append('modestbranding', '1');
  params.append('playsinline', '1');
  params.append('iv_load_policy', '3');
  params.append('cc_load_policy', '0');
  params.append('disablekb', '0');
  params.append('fs', '0');
  params.append('vq', 'hd1080');
  if (typeof window !== 'undefined') params.append('origin', window.location.origin);

  const youtubeUrl = `https://www.youtube.com/embed/${youtubeKey}?${params.toString()}`;

  if (cover) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          ref={iframeRef}
          src={youtubeUrl}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '177.78vh',
            height: '100vh',
            minWidth: '100vw',
            minHeight: '56.25vw',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen={false}
          loading="eager"
          onLoad={() => {
            setIsLoaded(true);
            ensureListening();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`} style={{ aspectRatio: '16/9' }}>
      <iframe
        ref={iframeRef}
        src={youtubeUrl}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        onLoad={() => {
          setIsLoaded(true);
          ensureListening();
        }}
      />
    </div>
  );
}
