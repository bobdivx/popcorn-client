import { useState, useEffect, useRef } from 'preact/hooks';
import { Play, Info, Film } from 'lucide-preact';
import type { LibraryMedia } from '../Library';
import { FocusableCard } from '../ui/FocusableCard';
import { useFocusDynamics } from '../ui/hooks/useFocusDynamics';

interface LibraryPosterProps {
  item: LibraryMedia;
  onPlay: (item: LibraryMedia) => void;
  className?: string;
}

export function LibraryPoster({ item, onPlay, className, priorityLoad }: LibraryPosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Hook pour Focus Dynamique "Pinned Left"
  const { cardRef: focusRef, isFocused } = useFocusDynamics({
    delay: 100,
    cardId: item.info_hash,
    onFocus: () => {
      setIsHovered(true);
    },
    onBlur: () => {
      setIsHovered(false);
    },
    disabled: false,
  });

  // Synchroniser les refs
  useEffect(() => {
    if (cardContainerRef.current && focusRef.current) {
      (focusRef.current as any).current = cardContainerRef.current;
    }
  }, []);

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    onPlay(item);
  };

  const displayTitle = item.name;
  const poster = item.poster_url || item.hero_image_url;
  const category = item.category || (item.tmdb_type === 'movie' ? 'FILM' : 'SERIES');
  const isMovie = category === 'FILM' || item.tmdb_type === 'movie';

  const sizeClassName =
    className ??
    'min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]';

  return (
    <div
      ref={cardContainerRef}
      data-torrent-card
      className={`relative group cursor-pointer torrent-poster ${sizeClassName}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        tabIndex={0}
      >
        <div className={`relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg transform transition-all duration-300 hover:scale-105 hover:shadow-primary focus-within:scale-[1.2] focus-within:shadow-primary-lg focus-within:ring-4 focus-within:ring-primary-600 focus-within:ring-opacity-60 focus-within:-translate-x-[10%] will-change-transform ${
          isFocused ? 'scale-[1.2] -translate-x-[10%] shadow-primary-lg' : ''
        }`}>
          {poster ? (
            <img
              src={poster}
              alt={displayTitle}
              className="w-full h-full object-cover"
              loading={priorityLoad ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priorityLoad ? 'high' : 'low'}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
              <div className="text-center p-4">
                <Film className="w-12 h-12 mb-2 text-gray-400 mx-auto" size={48} />
                <p className="text-xs text-gray-400 line-clamp-2">{displayTitle}</p>
              </div>
            </div>
          )}

          {/* Badge de résolution en haut à droite */}
          {item.resolution && (
            <div className="absolute top-2 right-2 lg:top-3 lg:right-3 tv:top-4 tv:right-4 z-10">
              <span className="badge badge-sm badge-primary glass-panel border border-white/30">
                {item.resolution}
              </span>
            </div>
          )}

          {/* Badge local/Popcorn en bas à gauche */}
          <div className="absolute bottom-2 left-2 lg:bottom-3 lg:left-3 tv:bottom-4 tv:left-4 z-10">
            {item.is_local_only ? (
              <span className="badge badge-sm badge-warning glass-panel border border-white/30" title="Fichier local uniquement">
                📁 Local
              </span>
            ) : (
              <span className="badge badge-sm badge-success glass-panel border border-white/30" title="Téléchargé via Popcorn">
                🍿 Popcorn
              </span>
            )}
          </div>

          {/* Icônes d'action au survol */}
          {isHovered && (
            <div className="absolute top-2 right-2 lg:top-3 lg:right-3 tv:top-4 tv:right-4 z-20 flex gap-2 tv:gap-3 pointer-events-auto">
              {/* Icône lecture */}
              <button
                className="w-9 h-9 lg:w-11 lg:h-11 tv:w-16 tv:h-16 glass-panel hover:bg-glass-hover rounded-full flex items-center justify-center transition-all shadow-primary border border-white/30 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[36px] tv:min-h-[64px]"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleClick(e);
                }}
                title="Lire"
              >
                <Play className="h-4 w-4 lg:h-5 lg:w-5 tv:h-8 tv:w-8 text-white" size={20} />
              </button>
              
              {/* Icône info */}
              <button
                className="w-9 h-9 lg:w-11 lg:h-11 tv:w-16 tv:h-16 glass-panel hover:bg-glass-hover rounded-full flex items-center justify-center transition-all shadow-primary border border-white/30 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[36px] tv:min-h-[64px]"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation();
                  handleClick(e);
                }}
                title="Plus d'infos"
              >
                <Info className="h-4 w-4 lg:h-5 lg:w-5 tv:h-8 tv:w-8 text-white" size={20} />
              </button>
            </div>
          )}

          {/* Overlay au survol */}
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 transition-opacity pointer-events-none">
              <div className="space-y-1.5 lg:space-y-2 tv:space-y-3">
                <h3 className="text-white font-semibold text-sm lg:text-base tv:text-lg line-clamp-1">
                  {displayTitle}
                </h3>
                <div className="flex items-center gap-2 text-xs lg:text-sm tv:text-base text-gray-300 flex-wrap">
                  {item.release_date && (
                    <>
                      <span>{new Date(item.release_date).getFullYear()}</span>
                      <span>•</span>
                    </>
                  )}
                  {item.vote_average && (
                    <>
                      <span>⭐ {item.vote_average.toFixed(1)}</span>
                      {item.quality && <span>•</span>}
                    </>
                  )}
                  {item.quality && (
                    <span>{item.quality}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </FocusableCard>
    </div>
  );
}