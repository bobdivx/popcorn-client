import { useState, useEffect } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { FocusableCard } from '../../ui/FocusableCard';

interface ResumePosterProps {
  item: ContentItem;
}

export function ResumePoster({ item }: ResumePosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);

  const playHref = item.infoHash
    ? `/torrents?slug=${encodeURIComponent(item.id)}&infoHash=${encodeURIComponent(item.infoHash)}&from=dashboard`
    : `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;

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
    window.location.href = playHref;
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
        href={playHref}
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
