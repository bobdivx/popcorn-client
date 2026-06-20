import { useEffect, useRef, useState } from 'preact/hooks';

const RETRY_DELAY_MS = 1500;

export function ScrubThumbnailSkeleton() {
  return (
    <div class="absolute inset-0 bg-white/10 overflow-hidden" aria-hidden>
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
    </div>
  );
}

interface ScrubThumbnailImageProps {
  src: string;
  loading: 'eager' | 'lazy';
  fetchPriority: 'high' | 'low';
  /** Réessayer le chargement tant que la génération serveur est en cours. */
  retryWhileLoading: boolean;
}

export function ScrubThumbnailImage({
  src,
  loading,
  fetchPriority,
  retryWhileLoading,
}: ScrubThumbnailImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    setAttempt(0);
  }, [src]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const effectiveSrc =
    attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}_t=${attempt}` : src;

  const handleLoad = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setLoaded(true);
  };

  const handleError = () => {
    setLoaded(false);
    if (retryWhileLoading) {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        setAttempt((n) => n + 1);
      }, RETRY_DELAY_MS);
    }
  };

  return (
    <>
      {!loaded && <ScrubThumbnailSkeleton />}
      <img
        key={effectiveSrc}
        src={effectiveSrc}
        alt=""
        class={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
}
