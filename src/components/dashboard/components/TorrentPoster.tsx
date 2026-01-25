import { useState, useEffect, useRef } from 'preact/hooks';
import { Film, Play, Info, Users, Sprout } from 'lucide-preact';
import type { ContentItem } from '../../../lib/client/types';
import { FocusableCard } from '../../ui/FocusableCard';
import { useFocusDynamics } from '../../ui/hooks/useFocusDynamics';
import { useTrailerImmersive } from '../../ui/hooks/useTrailerImmersive';

interface TorrentPosterProps {
  item: ContentItem;
}

export function TorrentPoster({ item }: TorrentPosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);
  const fetchedRef = useRef(false);

  // Debug: Log les données reçues pour comprendre pourquoi les images ne s'affichent pas
  useEffect(() => {
    if (!item.poster && !item.backdrop) {
      console.warn('[TorrentPoster] Pas d\'image pour:', {
        id: item.id,
        title: item.title,
        poster: item.poster,
        backdrop: item.backdrop,
        itemKeys: Object.keys(item),
      });
    }
  }, [item]);

  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Hook pour Focus Dynamique "Pinned Left"
  const { cardRef: focusRef, isFocused } = useFocusDynamics({
    delay: 100,
    cardId: item.id,
    onFocus: () => {
      setIsHovered(true);
    },
    onBlur: () => {
      setIsHovered(false);
    },
    disabled: false,
  });

  // Hook pour Trailer Immersif
  const { cardRef: trailerRef, isPlaying: isTrailerPlaying } = useTrailerImmersive({
    trailerUrl: item.trailerUrl,
    delay: 1500, // 1.5 seconde d'arrêt
    disabled: !item.trailerUrl,
  });

  // Synchroniser les refs des hooks avec le conteneur
  useEffect(() => {
    if (cardContainerRef.current) {
      // Assigner directement le conteneur aux refs des hooks
      // Les hooks utilisent maintenant focusin/focusout qui remontent dans le DOM
      (focusRef as any).current = cardContainerRef.current;
      (trailerRef as any).current = cardContainerRef.current;
    }
  }, [focusRef, trailerRef]);

  useEffect(() => {
    if (item.poster && item.poster !== imageUrl) {
      setImageUrl(item.poster);
    }
  }, [item.poster]);

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    window.location.href = `/player/${item.id}`;
  };

  // Formatage de la vitesse pour barre de santé
  const getHealthBarColor = (speed?: number): string => {
    if (!speed || !item.isDownloading) return 'transparent';
    // Vitesse en MB/s
    const speedMBps = speed / (1024 * 1024);
    if (speedMBps > 10) return 'bg-green-500'; // Rapide - Vert
    if (speedMBps > 2) return 'bg-yellow-500'; // Moyen - Jaune
    return 'bg-red-500'; // Lent - Rouge
  };

  return (
    <div
      ref={cardContainerRef}
      data-torrent-card
      className="relative group cursor-pointer torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        href={`/player/${item.id}`}
        tabIndex={0}
      >
        <div className={`relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg transform transition-all duration-300 hover:scale-105 hover:shadow-primary focus-within:scale-[1.2] focus-within:shadow-primary-lg focus-within:ring-4 focus-within:ring-primary-600 focus-within:ring-opacity-60 focus-within:-translate-x-[10%] will-change-transform ${
          isFocused ? 'scale-[1.2] -translate-x-[10%] shadow-primary-lg' : ''
        }`}>
          {/* Dégradé radial pour lisibilité du texte si trailer actif */}
          {isTrailerPlaying && (
            <div className="absolute inset-0 bg-gradient-radial from-black/80 via-black/50 to-transparent z-[5] pointer-events-none" />
          )}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="text-center p-4">
              <Film className="w-12 h-12 mb-2 text-gray-400 mx-auto" size={48} />
              <p className="text-xs text-gray-400 line-clamp-2">{item.title}</p>
            </div>
          </div>
        )}

        {/* Logo Popcorn en haut à gauche */}
        <div className="absolute top-1 left-1 lg:top-2 lg:left-2 tv:top-3 tv:left-3 z-10">
          <div className="w-6 h-6 lg:w-8 lg:h-8 tv:w-12 tv:h-12 bg-primary rounded flex items-center justify-center shadow-primary transition-all duration-200">
            <span className="text-white text-xs lg:text-sm tv:text-base font-bold">P</span>
          </div>
        </div>

        {/* Stats temps réel (Seeds/Peers) - discret en bas de la tuile */}
        {(item.seeds !== undefined || item.peers !== undefined) && (
          <div className="absolute bottom-2 left-2 lg:bottom-3 lg:left-3 tv:bottom-4 tv:left-4 z-10">
            <div className="bg-glass glass-panel rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-2 tv:gap-3 text-xs tv:text-sm text-white">
              {item.seeds !== undefined && (
                <div className="flex items-center gap-1">
                  <Sprout className="w-3 h-3 tv:w-4 tv:h-4 text-green-400" size={16} />
                  <span className="font-semibold">{item.seeds}</span>
                </div>
              )}
              {item.seeds !== undefined && item.peers !== undefined && (
                <span className="text-white/50">|</span>
              )}
              {item.peers !== undefined && (
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 tv:w-4 tv:h-4 text-blue-400" size={16} />
                  <span className="font-semibold">{item.peers}</span>
                </div>
              )}
            </div>
          </div>
        )}

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
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs lg:text-sm tv:text-base text-gray-300 flex-wrap">
                {item.year && (
                  <>
                    <span>{item.year}</span>
                    <span>•</span>
                  </>
                )}
                {item.rating && (
                  <>
                    <span>⭐ {item.rating.toFixed(1)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
        
        {/* Barre de santé - fine ligne colorée sous la tuile si téléchargement actif */}
        {item.isDownloading && item.downloadSpeed !== undefined && (
          <div className="absolute -bottom-1 left-0 right-0 h-1 tv:h-1.5 rounded-b-lg overflow-hidden z-10">
            <div 
              className={`h-full transition-all duration-300 ${getHealthBarColor(item.downloadSpeed)} ${
                item.downloadSpeed > 0 ? 'animate-pulse' : ''
              }`}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </FocusableCard>
    </div>
  );
}
