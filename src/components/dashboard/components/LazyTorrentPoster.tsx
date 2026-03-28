import { useState, useEffect, useRef } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { TorrentPoster } from './TorrentPoster';

interface LazyTorrentPosterProps {
  item: ContentItem;
  /**
   * Marge de chargement anticipé (en pixels) pour commencer à charger avant que l'élément soit visible
   * @default 200
   */
  rootMargin?: string;
}

/**
 * Composant wrapper qui charge TorrentPoster uniquement lorsque l'élément devient visible
 * Utilise IntersectionObserver pour optimiser les performances
 */
export function LazyTorrentPoster({ item, rootMargin = '200px' }: LazyTorrentPosterProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Si IntersectionObserver n'est pas disponible, charger immédiatement
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldRender(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin,
        threshold: 0.01, // Déclencher dès qu'un pixel est visible
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  // Placeholder minimal pour maintenir l'espace
  if (!shouldRender) {
    return (
      <div
        ref={containerRef}
        className="relative min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      >
        <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] rounded-xl border border-white/10 bg-[#141414] overflow-hidden shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <TorrentPoster item={item} />
    </div>
  );
}
