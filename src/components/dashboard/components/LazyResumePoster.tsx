import { useState, useEffect, useRef } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { ResumePoster } from './ResumePoster';

interface LazyResumePosterProps {
  item: ContentItem;
  /**
   * Marge de chargement anticipé (en pixels) pour commencer à charger avant que l'élément soit visible
   * @default 200
   */
  rootMargin?: string;
}

/**
 * Composant wrapper qui charge ResumePoster uniquement lorsque l'élément devient visible
 * Utilise IntersectionObserver pour optimiser les performances
 */
export function LazyResumePoster({ item, rootMargin = '200px' }: LazyResumePosterProps) {
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
        <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg animate-pulse">
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <ResumePoster item={item} />
    </div>
  );
}
