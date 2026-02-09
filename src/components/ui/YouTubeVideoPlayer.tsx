import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';

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

/** Détecte webOS (LG), TV ou autres appareils où l'iframe YouTube est souvent bloquée ou indisponible. */
function isEmbedUnsupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Web0S|webOS|NetCast|TV Safari|SmartTV|Large Screen/i.test(ua) ||
    (typeof (window as any).webOS !== 'undefined')
  );
}

/**
 * Composant réutilisable pour afficher une vidéo YouTube en embed
 * Utilisé pour les bandes annonces dans le Hero et les pages de détails.
 * Sur webOS/TV, affiche un lien vers YouTube (l'iframe n'est en général pas supportée).
 */
export function YouTubeVideoPlayer({
  youtubeKey,
  autoplay = false,
  muted = true,
  loop = false,
  controls = true,
  className = '',
  onEnded,
  cover = false,
}: YouTubeVideoPlayerProps) {
  const { t } = useI18n();
  const [isLoaded, setIsLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setUseFallback(isEmbedUnsupported());
  }, []);

  useEffect(() => {
    setIsLoaded(true);
  }, [youtubeKey]);

  if (!youtubeKey) {
    return null;
  }

  const watchUrl = `https://www.youtube.com/watch?v=${youtubeKey}`;

  // Sur webOS/TV : afficher un lien vers YouTube au lieu de l'iframe
  if (useFallback) {
    const fallbackContent = (
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60 p-4 text-center text-sm text-white hover:bg-black/80 hover:underline focus:outline-none focus:ring-2 focus:ring-yellow-500"
        style={{ minHeight: cover ? '100%' : 120 }}
      >
        <span className="opacity-90">{t('ads.trailerEmbedUnsupported')}</span>
        <span className="font-medium text-yellow-400">{t('ads.trailerWatchOnYoutube')}</span>
      </a>
    );
    if (cover) {
      return (
        <div className={`relative w-full h-full overflow-hidden ${className}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
          {fallbackContent}
        </div>
      );
    }
    return (
      <div className={`relative w-full h-full ${className}`} style={{ aspectRatio: '16/9' }}>
        {fallbackContent}
      </div>
    );
  }

  // Construire l'URL YouTube avec les paramètres
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
  params.append('enablejsapi', '1');
  params.append('origin', typeof window !== 'undefined' ? window.location.origin : '');
  params.append('iv_load_policy', '3'); // Ne pas afficher les annotations
  params.append('cc_load_policy', '0'); // Pas de sous-titres par défaut
  
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
            pointerEvents: 'none',
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen={false}
          loading="lazy"
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
