import { useState, useEffect, useRef } from 'preact/hooks';
import { Film, Play, Info } from 'lucide-preact';
import type { ContentItem } from '../../../lib/client/types';

interface TorrentPosterProps {
  item: ContentItem;
}

export function TorrentPoster({ item }: TorrentPosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (item.poster && item.poster !== imageUrl) {
      setImageUrl(item.poster);
    }
  }, [item.poster]);

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = `/player/${item.id}`;
  };

  return (
    <div
      className="relative group cursor-pointer torrent-poster"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg transform transition-transform duration-300 hover:scale-105">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
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
        <div className="absolute top-1 left-1 lg:top-2 lg:left-2 z-10">
          <div className="w-6 h-6 lg:w-8 lg:h-8 bg-red-600 rounded flex items-center justify-center">
            <span className="text-white text-xs lg:text-sm font-bold">P</span>
          </div>
        </div>

        {/* Icônes d'action au survol */}
        {isHovered && (
          <div className="absolute top-2 right-2 lg:top-3 lg:right-3 z-20 flex gap-2 pointer-events-auto">
            {/* Icône lecture */}
            <button
              className="w-9 h-9 lg:w-11 lg:h-11 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all backdrop-blur-sm shadow-lg border border-white/30 hover:scale-110"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleClick(e);
              }}
              title="Lire"
            >
              <Play className="h-4 w-4 lg:h-5 lg:w-5 text-white" size={20} />
            </button>
            
            {/* Icône info */}
            <button
              className="w-9 h-9 lg:w-11 lg:h-11 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all backdrop-blur-sm shadow-lg border border-white/30 hover:scale-110"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleClick(e);
              }}
              title="Plus d'infos"
            >
              <Info className="h-4 w-4 lg:h-5 lg:w-5 text-white" size={20} />
            </button>
          </div>
        )}

        {/* Overlay au survol */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 transition-opacity pointer-events-none">
            <div className="space-y-1.5 lg:space-y-2">
              <h3 className="text-white font-semibold text-sm lg:text-base line-clamp-1">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-xs lg:text-sm text-gray-300 flex-wrap">
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
    </div>
  );
}
