import { useState, useEffect, useRef } from 'preact/hooks';
import { isTVPlatform } from '../../lib/utils/device-detection';

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

/** Lecteur YouTube (privacy / nocookie) — moins de challenges « robot » en embed. */
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
  const isTv = typeof window !== 'undefined' && isTVPlatform();

  useEffect(() => {
    setIsLoaded(true);
  }, [youtubeKey]);

  const postToPlayer = (message: unknown) => {
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow;
    if (!iframe || !win) return;
    try {
      win.postMessage(typeof message === 'string' ? message : JSON.stringify(message), '*');
    } catch {
      // ignore
    }
  };

  const ensureListening = () => {
    postToPlayer({ event: 'listening', id: youtubeKey });
    postToPlayer({ event: 'command', func: 'addEventListener', args: ['onStateChange'] });
  };

  useEffect(() => {
    if (!onEnded || loop) return;

    let ended = false;
    const safeEnded = () => {
      if (ended) return;
      ended = true;
      onEnded();
    };

    const looksLikeEnded = (data: any): boolean => {
      if (!data || typeof data !== 'object') return false;
      if (data.event === 'onStateChange') {
        const info = data.info;
        if (info === 0 || info === '0') return true;
      }
      if (data.event === 'infoDelivery' && data.info != null) {
        const info = data.info;
        if (info === 0 || info === '0') return true;
        if (typeof info === 'number' && info === 0) return true;
        if (typeof info === 'object' && (info.playerState === 0 || info.playerState === '0')) return true;
      }
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

  useEffect(() => {
    if (!onEnded || loop) return;
    if (!isLoaded) return;
    ensureListening();
  }, [onEnded, loop, youtubeKey, isLoaded]);

  // Autoplay avec son : démarrer mute (politique navigateur), puis unmute.
  // Sur TV on reste mute : unmute agressif + embed déclenche souvent le challenge « robot ».
  const wantSound = autoplay && !muted && !isTv;
  useEffect(() => {
    if (!wantSound || !isLoaded) return;
    const unmute = () => {
      postToPlayer({ event: 'command', func: 'unMute', args: [] });
      postToPlayer({ event: 'command', func: 'setVolume', args: [100] });
    };
    const t1 = window.setTimeout(unmute, 400);
    const t2 = window.setTimeout(unmute, 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [wantSound, isLoaded, youtubeKey]);

  if (!youtubeKey) return null;

  const params = new URLSearchParams();
  if (autoplay) params.append('autoplay', '1');
  // TV : toujours mute en autoplay (évite captcha + politiques média)
  if (muted || wantSound || isTv) params.append('mute', '1');
  if (loop) {
    params.append('loop', '1');
    params.append('playlist', youtubeKey);
  }
  if (!controls) params.append('controls', '0');
  if (onEnded || wantSound) params.append('enablejsapi', '1');
  params.append('rel', '0');
  params.append('modestbranding', '1');
  params.append('playsinline', '1');
  params.append('iv_load_policy', '3');
  params.append('cc_load_policy', '0');
  params.append('disablekb', '1');
  params.append('fs', '0');
  if (typeof window !== 'undefined') {
    params.append('origin', window.location.origin);
    params.append('widget_referrer', window.location.origin);
  }

  // Privacy-enhanced : moins de cookies / challenges « Sign in to confirm you're not a robot »
  const youtubeUrl = `https://www.youtube-nocookie.com/embed/${youtubeKey}?${params.toString()}`;

  const iframeCommon = {
    ref: iframeRef,
    src: youtubeUrl,
    // Important pour les embeds TV / WebView
    referrerPolicy: 'strict-origin-when-cross-origin' as const,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    loading: 'eager' as const,
    onLoad: () => {
      setIsLoaded(true);
      ensureListening();
    },
  };

  if (cover) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          {...iframeCommon}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '177.78vh',
            height: '100vh',
            minWidth: '100vw',
            minHeight: '56.25vw',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
          allowFullScreen={false}
          title="Trailer"
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`} style={className.includes('aspect-auto') ? undefined : { aspectRatio: '16/9' }}>
      <iframe
        {...iframeCommon}
        className="absolute inset-0 w-full h-full pointer-events-none"
        allowFullScreen
        title="Trailer"
      />
    </div>
  );
}
