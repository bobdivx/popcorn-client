import { useState, useEffect, useRef } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { YouTubeVideoPlayer } from '../../ui/YouTubeVideoPlayer';

interface HeroSectionProps {
  items: ContentItem[];
  onPlay: (item: ContentItem) => void;
}

export function HeroSection({ items, onPlay }: HeroSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [trailerKeys, setTrailerKeys] = useState<Record<string, string | null>>({});
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(true);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState<Record<string, boolean>>({});
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const trailerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Carousel automatique
  useEffect(() => {
    if (items.length <= 1) return;

    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }

    autoPlayRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 10000);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
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

  const handleMoreInfo = (item: ContentItem) => {
    window.location.href = `/player/${item.id}`;
  };

  const handlePlay = () => {
    if (currentItem) {
      onPlay(currentItem);
    }
  };

  if (!currentItem) {
    return null;
  }

  const currentImageUrl = imageUrls[currentItem.id];
  const currentTrailerKey = trailerKeys[currentItem.id];

  return (
    <div className="relative w-full h-[70vh] min-h-[380px] sm:min-h-[500px] tv:min-h-[600px] max-h-[800px] mb-8 overflow-hidden -mt-8 sm:-mt-20 md:-mt-32">
      {/* Vidéo de la bande annonce ou image de fond */}
      {isPlayingTrailer && currentTrailerKey ? (
        <div className="absolute inset-0">
          <YouTubeVideoPlayer
            youtubeKey={currentTrailerKey}
            autoplay={true}
            muted={true}
            loop={false}
            controls={false}
            cover={true}
            className="w-full h-full"
            onEnded={() => {
              // Quand la bande annonce se termine, repasser à l'image
              setIsPlayingTrailer(false);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{
            backgroundImage: currentImageUrl || currentItem.backdrop ? `url(${currentImageUrl || currentItem.backdrop})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        </div>
      )}

      {/* Indicateurs de carousel */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-2">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index);
                if (autoPlayRef.current) {
                  clearInterval(autoPlayRef.current);
                }
              }}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex ? 'w-8 bg-white' : 'w-2 bg-white/50'
              }`}
              aria-label={`Aller au contenu ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Contenu */}
      <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 lg:px-16 tv:px-24 pb-16 tv:pb-20">
        <div className="max-w-2xl tv:max-w-3xl">
          {/* Badge catégorie */}
          <div className="mb-4 tv:mb-6">
            <span className="inline-flex items-center gap-2 tv:gap-3 text-white">
              <span className="w-8 h-8 tv:w-12 tv:h-12 bg-primary rounded flex items-center justify-center shadow-primary">
                <span className="text-white text-xs tv:text-base font-bold">P</span>
              </span>
              <span className="text-sm tv:text-lg font-semibold uppercase">
                {currentItem.type === 'movie' ? 'Film' : currentItem.type === 'tv' ? 'Série' : 'Contenu'}
              </span>
            </span>
          </div>

          {/* Titre */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl tv:text-8xl font-bold text-white mb-4 tv:mb-6 drop-shadow-2xl">
            {currentItem.title}
          </h1>

          {/* Description */}
          {currentItem.overview && (
            <p className="text-base sm:text-lg tv:text-xl text-white/90 mb-6 tv:mb-8 line-clamp-3 drop-shadow-lg max-w-xl tv:max-w-2xl">
              {currentItem.overview}
            </p>
          )}

          {/* Métadonnées */}
          <div className="flex flex-wrap items-center gap-4 tv:gap-6 mb-6 tv:mb-8 text-sm tv:text-base text-white/80">
            {currentItem.year && <span>{currentItem.year}</span>}
            {currentItem.rating && (
              <>
                <span>•</span>
                <span>⭐ {currentItem.rating.toFixed(1)}</span>
              </>
            )}
          </div>

          {/* Boutons d'action */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 tv:gap-6">
            <button
              onClick={handlePlay}
              className="w-full sm:w-auto bg-primary hover:bg-primary-700 text-white px-8 py-3 tv:px-12 tv:py-4 rounded-lg font-semibold text-lg tv:text-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 tv:h-8 tv:w-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              ► Play New
            </button>
            <button
              onClick={() => handleMoreInfo(currentItem)}
              className="w-full sm:w-auto bg-glass hover:bg-glass-hover text-white px-8 py-3 tv:px-12 tv:py-4 rounded-lg font-semibold text-lg tv:text-xl flex items-center justify-center gap-2 transition-all duration-300 border border-white/30 glass-panel focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 tv:h-8 tv:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
