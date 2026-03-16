import { useState, useEffect, useRef } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getHighQualityTmdbImageUrl } from '../../../lib/utils/tmdb-images';
import { getDisplayTitle } from '../../../lib/utils/title-display';
import { YouTubeVideoPlayer } from '../../ui/YouTubeVideoPlayer';

interface HeroSectionProps {
  items: ContentItem[];
  onPlay: (item: ContentItem) => void;
  /** Label du bouton principal (défaut: "► Play New") */
  primaryButtonLabel?: string;
  /** Icône du bouton principal (défaut: icône play) */
  primaryButtonIcon?: preact.ComponentChildren;
  /** Action du bouton principal (défaut: ouvrir la fiche média) */
  onPrimaryAction?: (item: ContentItem) => void | Promise<void>;
  /** Désactiver le bouton principal */
  primaryActionDisabled?: boolean;
  /** Ne pas remonter sous l'élément au-dessus (ex: barre switch) — désactive les marges négatives */
  noOverlap?: boolean;
}

const MIN_SWIPE_DISTANCE = 50;

export function HeroSection({
  items,
  onPlay,
  primaryButtonLabel,
  primaryButtonIcon,
  onPrimaryAction,
  primaryActionDisabled = false,
  noOverlap = false,
}: HeroSectionProps) {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [trailerKeys, setTrailerKeys] = useState<Record<string, string | null>>({});
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(true);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState<Record<string, boolean>>({});
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const trailerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);

  if (!items || items.length === 0) {
    return null;
  }

  const validIndex = Math.min(currentIndex, items.length - 1);
  const currentItem = items[validIndex];

  // Charger les images
  useEffect(() => {
    items.forEach((item) => {
      if (item.poster && !imageUrls[item.id]) {
        setImageUrls((prev) => ({ ...prev, [item.id]: item.poster! }));
      }
    });
  }, [items]);

  // Charger la bande annonce
  useEffect(() => {
    if (!currentItem) return;
    const itemId = currentItem.id;
    
    if (trailerKeys[itemId] !== undefined) {
      setIsPlayingTrailer(trailerKeys[itemId] !== null);
      return;
    }

    // Vérifier si le torrent a une clé de trailer
    const trailerKey = (currentItem as any).trailerKey || (currentItem as any).trailer_key || null;
    
    if (trailerKey && typeof trailerKey === 'string' && trailerKey.trim().length > 0) {
      setTrailerKeys((prev) => ({ ...prev, [itemId]: trailerKey }));
      setIsPlayingTrailer(true);
      setIsLoadingTrailer((prev) => ({ ...prev, [itemId]: true }));
    } else {
      setTrailerKeys((prev) => ({ ...prev, [itemId]: null }));
      setIsPlayingTrailer(false);
    }
  }, [currentIndex, currentItem?.id, currentItem]);

  // Carousel automatique : défilement toutes les 6 secondes
  useEffect(() => {
    if (items.length <= 1) return;

    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 6000);
    autoPlayRef.current = interval;

    return () => {
      clearInterval(interval);
      autoPlayRef.current = null;
    };
  }, [items.length]);

  useEffect(() => {
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
      if (trailerTimeoutRef.current) {
        clearTimeout(trailerTimeoutRef.current);
      }
    };
  }, []);

  const getItemUrl = (item: ContentItem) => {
    // Item Discover (id tmdb-xxx-type) → page discover
    if (item.id?.startsWith('tmdb-') && item.tmdbId) {
      return `/discover?tmdbId=${item.tmdbId}&type=${item.type}`;
    }
    // Torrent (slug ou id) → page détail torrent
    return `/torrents/${item.id}?from=dashboard`;
  };

  const handleMoreInfo = (item: ContentItem) => {
    window.location.href = getItemUrl(item);
  };

  const handlePlay = () => {
    if (currentItem) {
      window.location.href = getItemUrl(currentItem);
    }
  };

  const resolvedPrimaryLabel = primaryButtonLabel ?? t('dashboard.playNew');

  const handlePrimaryAction = async () => {
    if (!currentItem || primaryActionDisabled) return;
    if (onPrimaryAction) {
      await onPrimaryAction(currentItem);
      return;
    }
    handlePlay();
  };

  // Swipe tactile pour naviguer entre les slides (gauche/droite)
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: TouchEvent) => {
    if (items.length <= 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX.current;
    if (deltaX < -MIN_SWIPE_DISTANCE) {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    } else if (deltaX > MIN_SWIPE_DISTANCE) {
      setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    }
  };

  if (!currentItem) {
    return null;
  }

  const rawImageUrl = imageUrls[currentItem.id] || currentItem.poster || currentItem.backdrop;
  const currentImageUrl = getHighQualityTmdbImageUrl(rawImageUrl) ?? rawImageUrl;
  const currentTrailerKey = trailerKeys[currentItem.id];

  return (
    <div
      className={`hero-dashboard relative z-0 w-full mb-8 overflow-hidden touch-pan-y ${noOverlap ? '' : '-mt-8 sm:-mt-20 md:-mt-32'}`}
      data-dark-context
      style={{
        height: 'clamp(320px, 50vh, 560px)',
        touchAction: 'pan-y',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Animation de fondu entre les slides */}
      <style>{`
        @keyframes hero-slide-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hero-slide-enter {
          animation: hero-slide-fade 0.6s ease-out forwards;
        }
      `}</style>

      {/* ─── Couche fond : vidéo ou image ─── */}
      {isPlayingTrailer && currentTrailerKey ? (
        <div key={`trailer-${currentIndex}`} className="absolute inset-0 hero-slide-enter">
          <YouTubeVideoPlayer
            youtubeKey={currentTrailerKey}
            autoplay={true}
            muted={true}
            loop={false}
            controls={false}
            cover={true}
            className="w-full h-full"
            onEnded={() => setIsPlayingTrailer(false)}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        </div>
      ) : (
        <div
          key={`bg-${currentIndex}`}
          className="absolute inset-0 bg-cover bg-center hero-slide-enter"
          style={{
            backgroundImage: currentImageUrl || currentItem.backdrop ? `url(${currentImageUrl || currentItem.backdrop})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>
      )}

      {/* ─── Contenu : deux zones (texte + barre d’actions) ─── */}
      <div
        key={`content-${currentIndex}`}
        className={`absolute inset-0 z-10 flex flex-col ${!noOverlap ? 'mt-8 sm:mt-20 md:mt-32' : ''}`}
      >
        {/* Zone 1 : métadonnées, logo, titre, description — alignée en bas, au-dessus de la barre */}
        <div className="flex-1 min-h-0 flex flex-col justify-end px-4 sm:px-6 lg:px-16 tv:px-24 pb-3 overflow-hidden hero-slide-enter">
          <div className="max-w-2xl tv:max-w-3xl w-full flex flex-col gap-2 sm:gap-3">
            {/* Ligne métadonnées */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-white/95">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide">
                {currentItem.type === 'movie' ? t('common.film') : currentItem.type === 'tv' ? t('common.serie') : t('common.content')}
              </span>
              {(currentItem.year ?? (currentItem.releaseDate ? String(currentItem.releaseDate).slice(0, 4) : null)) && (
                <>
                  <span className="text-white/50">•</span>
                  <span className="text-xs sm:text-sm">{currentItem.year ?? String(currentItem.releaseDate || '').slice(0, 4)}</span>
                </>
              )}
              {currentItem.rating != null && (
                <>
                  <span className="text-white/50">•</span>
                  <span className="text-xs sm:text-sm">⭐ {Number(currentItem.rating).toFixed(1)}</span>
                </>
              )}
            </div>

            {/* Logo (si présent) */}
            {currentItem.logo && (
              <img
                src={currentItem.logo}
                alt=""
                className="max-h-7 sm:max-h-8 md:max-h-10 lg:max-h-12 w-auto object-contain object-left drop-shadow-2xl"
                style={{ maxWidth: 'min(14rem, 60vw)' }}
              />
            )}

            {/* Titre */}
            <h1 className={`font-bold drop-shadow-2xl line-clamp-2 ${
              currentItem.logo
                ? 'text-base sm:text-lg md:text-xl lg:text-2xl tv:text-3xl text-white/95'
                : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl tv:text-5xl text-white'
            }`}>
              {getDisplayTitle(currentItem) || currentItem.title || ''}
            </h1>

            {/* Description (2 lignes max) */}
            {currentItem.overview && (
              <p className="text-xs sm:text-sm tv:text-base text-white/80 line-clamp-2 drop-shadow-lg max-w-xl">
                {currentItem.overview}
              </p>
            )}
          </div>
        </div>

        {/* Zone 2 : barre d’actions — hauteur fixe, toujours visible en bas */}
        <div className="flex-shrink-0 px-4 sm:px-6 lg:px-16 tv:px-24 py-3 sm:py-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent hero-slide-enter">
          <div className="max-w-2xl tv:max-w-3xl w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
              <button
                onClick={handlePrimaryAction}
                data-focusable
                tabIndex={0}
                disabled={primaryActionDisabled}
                aria-busy={primaryActionDisabled}
                className="w-full xs:w-auto bg-primary hover:bg-primary-700 text-white px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-transparent min-h-[42px] sm:min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {primaryButtonIcon ?? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
                {resolvedPrimaryLabel}
              </button>
              <button
                onClick={() => handleMoreInfo(currentItem)}
                data-focusable
                tabIndex={0}
                className="w-full xs:w-auto bg-white/20 hover:bg-white/30 text-white px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all border border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-transparent min-h-[42px] sm:min-h-[44px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('common.details')}
              </button>
            </div>
            {items.length > 1 && (
              <div className="flex justify-center sm:justify-end gap-1.5" role="tablist" aria-label={t('dashboard.carouselIndicators')}>
                {items.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    aria-selected={index === currentIndex}
                    aria-label={`${t('dashboard.goToContent')} ${index + 1}`}
                    onClick={() => setCurrentIndex(index)}
                    className={`h-1.5 sm:h-2 rounded-full transition-all ${
                      index === currentIndex ? 'w-6 sm:w-7 bg-white' : 'w-1.5 sm:w-2 bg-white/50 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
