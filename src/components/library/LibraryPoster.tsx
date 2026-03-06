import { useState } from 'preact/hooks';
import { Film, Download, HardDrive, FolderOpen, Users } from 'lucide-preact';
import type { LibraryMedia } from '../Library';
import { FocusableCard } from '../ui/FocusableCard';
import { useI18n } from '../../lib/i18n/useI18n';

interface LibraryPosterProps {
  item: LibraryMedia;
  onPlay: (item: LibraryMedia) => void;
  className?: string;
  priorityLoad?: boolean;
}

export function LibraryPoster({ item, onPlay, className, priorityLoad }: LibraryPosterProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isDownloading = !item.exists;
  const externalLabel = item.library_source_label?.trim() || t('library.badgeExternalLibrary');

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    onPlay(item);
  };

  const displayTitle = item.name;
  const poster = item.poster_url || item.hero_image_url;

  const sizeClassName =
    className ??
    'min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]';

  const showOverlay = isHovered || isFocused;

  return (
    <div
      data-torrent-card
      className={`relative group cursor-pointer torrent-poster ${sizeClassName}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        tabIndex={0}
        ariaLabel={displayTitle}
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

          {/* Badge "En cours" pour médias en téléchargement */}
          {isDownloading && (
            <div className="absolute top-2 left-2 lg:top-3 lg:left-3 tv:top-4 tv:left-4 z-10">
              <span className="badge badge-sm badge-warning glass-panel border border-amber-400/50 animate-pulse max-w-[calc(100%-0.5rem)] truncate">
                {t('library.downloadingBadge')}
              </span>
            </div>
          )}
          {/* Badge de résolution en haut à droite (masqué si en cours pour éviter la surcharge) */}
          {item.resolution && !isDownloading && (
            <div className="absolute top-2 right-2 lg:top-3 lg:right-3 tv:top-4 tv:right-4 z-10">
              <span className="badge badge-sm badge-primary glass-panel border border-white/30 max-w-[calc(100%-0.5rem)] truncate">
                {item.resolution}
              </span>
            </div>
          )}

          {/* Badge source : partagé par ami / bibliothèque externe / Popconn / local */}
          <div className="absolute bottom-2 left-2 lg:bottom-3 lg:left-3 tv:bottom-4 tv:left-4 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-0.5rem)]">
            {item.__shared ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] lg:text-xs font-medium bg-violet-600/90 text-white border border-violet-400/50 shadow-sm" title={item.__shared.friendLabel}>
                <Users className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span className="truncate">{item.__shared.friendLabel || t('library.badgeSharedByFriend')}</span>
              </span>
            ) : item.is_external_source ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] lg:text-xs font-medium bg-sky-600/90 text-white border border-sky-400/50 shadow-sm" title={externalLabel}>
                <FolderOpen className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span className="truncate">{externalLabel}</span>
              </span>
            ) : (() => {
              const isPopconn = !item.is_local_only || (item.info_hash && !item.info_hash.startsWith('local_') && /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(item.info_hash));
              return isPopconn;
            })() ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] lg:text-xs font-medium bg-emerald-600/90 text-white border border-emerald-400/50 shadow-sm" title={t('library.badgePopcorn')}>
                <Download className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span className="truncate">{t('library.badgePopcorn')}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] lg:text-xs font-medium bg-amber-600/90 text-white border border-amber-400/50 shadow-sm" title={t('library.badgeLocal')}>
                <HardDrive className="w-3 h-3 lg:w-3.5 lg:h-3.5 shrink-0" />
                <span className="truncate">{t('library.badgeLocal')}</span>
              </span>
            )}
          </div>

          {/* Overlay au survol */}
          {showOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 pb-10 lg:pb-12 tv:pb-16 transition-opacity pointer-events-none">
              <div className="space-y-1.5 lg:space-y-2 tv:space-y-3 max-w-full">
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