import { useState, useEffect } from 'preact/hooks';
import { Play, Info } from 'lucide-preact';
import type { ContentItem } from '../../../lib/client/types';
import { FocusableCard } from '../../ui/FocusableCard';

interface ResumePosterProps {
  item: ContentItem;
}

export function ResumePoster({ item }: ResumePosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);

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

  const progress = item.progress || 0;
  const showOverlay = isHovered || isFocused;

  return (
    <div
      className="relative group cursor-pointer torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        href={`/player/${item.id}`}
        tabIndex={0}
        onFocus={() => {
          setIsFocused(true);
          setIsHovered(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsHovered(false);
        }}
      >
        <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900 shadow-lg rounded-lg transform transition-all duration-200 ease-out hover:scale-[1.03] hover:shadow-primary focus-within:shadow-primary-lg will-change-transform">
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
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-xs text-gray-400 line-clamp-2">{item.title}</p>
            </div>
          </div>
        )}

        {/* Barre de progression en bas */}
        <div className="absolute bottom-0 left-0 right-0 h-1 tv:h-2 bg-gray-700">
          <div 
            className="h-full bg-primary transition-all shadow-primary"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Logo Popcorn */}
        <div className="absolute top-1 left-1 lg:top-2 lg:left-2 tv:top-3 tv:left-3 z-10">
          <div className="w-6 h-6 lg:w-8 lg:h-8 tv:w-12 tv:h-12 bg-primary rounded flex items-center justify-center shadow-primary transition-all duration-200">
            <span className="text-white text-xs lg:text-sm tv:text-base font-bold">P</span>
          </div>
        </div>

        {/* Icônes d'action au survol */}
        {showOverlay && (
          <div className="absolute bottom-2 right-2 lg:bottom-3 lg:right-3 tv:bottom-4 tv:right-4 z-20 flex gap-2 tv:gap-3 pointer-events-auto">
            {/* Icône lecture */}
            <button
              className="w-9 h-9 lg:w-11 lg:h-11 tv:w-16 tv:h-16 bg-primary/95 hover:bg-primary-500 rounded-full flex items-center justify-center transition-all backdrop-blur-sm shadow-primary hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[36px] tv:min-h-[64px] glass-panel"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleClick(e);
              }}
              title="Reprendre la lecture"
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
        {showOverlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 pb-10 lg:pb-12 tv:pb-16 transition-opacity pointer-events-none">
            <div className="space-y-1.5 lg:space-y-2 tv:space-y-3">
              <h3 className="text-white font-semibold text-sm lg:text-base tv:text-lg line-clamp-1">
                {item.title}
              </h3>
              <div className="text-xs lg:text-sm tv:text-base text-gray-300">
                {Math.round(progress)}% regardé
              </div>
            </div>
          </div>
        )}
        </div>
      </FocusableCard>
    </div>
  );
}
