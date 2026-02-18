import { useState, useEffect, useRef } from 'preact/hooks';

interface YouTubeVideoPlayerProps {
  youtubeKey: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  className?: string;
  onEnded?: () => void;
  cover?: boolean; // Mode cover pour remplir l'écran comme une image de fond
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
}: YouTubeVideoPlayerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setIsLoaded(true);
  }, [youtubeKey]);

  if (!youtubeKey) {
    return null;
  }

  // Construire l'URL YouTube embed
  const params = new URLSearchParams();
  if (autoplay) params.append('autoplay', '1');
  if (muted) params.append('mute', '1');
  if (loop) {
    params.append('loop', '1');
    params.append('playlist', youtubeKey);
  }
  if (!controls) params.append('controls', '0');
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
    // Mode cover : la vidéo remplit le conteneur comme une image de fond
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
          onLoad={() => setIsLoaded(true)}
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
        onLoad={() => setIsLoaded(true)}
      />
    </div>
  );
}
