import { useState, useEffect } from 'preact/hooks';
import { Film, Users, Sprout, CheckCircle2 } from 'lucide-preact';
import type { ContentItem } from '../../../lib/client/types';
import { FocusableCard } from '../../ui/FocusableCard';
import { useTorrentProgress } from '../hooks/useTorrentProgress';

interface TorrentPosterProps {
  item: ContentItem;
}

export function TorrentPoster({ item }: TorrentPosterProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);
  
  // Récupérer les stats de téléchargement si infoHash est disponible
  const { torrentStats } = useTorrentProgress(item.infoHash);

  const playHref = item.infoHash
    ? `/torrents?slug=${encodeURIComponent(item.id)}&infoHash=${encodeURIComponent(item.infoHash)}&from=dashboard`
    : `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;

  useEffect(() => {
    if (item.poster && item.poster !== imageUrl) {
      setImageUrl(item.poster);
    }
  }, [item.poster]);

  // Déterminer l'état du téléchargement
  const isDownloading = torrentStats && (torrentStats.state === 'downloading' || torrentStats.state === 'queued');
  const isCompleted = torrentStats && (torrentStats.state === 'completed' || torrentStats.state === 'seeding');
  const progressPercent = torrentStats ? Math.round(torrentStats.progress * 100) : 0;
  const showOverlay = isHovered || isFocused;

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    window.location.href = playHref;
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
      data-torrent-card
      className="relative group cursor-pointer torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        className="w-full"
        onClick={handleClick}
        href={playHref}
        tabIndex={0}
        ariaLabel={item.title}
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

        {/* Badge indexer en haut à gauche (design system) */}
        <div className="absolute top-1 left-1 lg:top-2 lg:left-2 tv:top-3 tv:left-3 z-10 max-w-[calc(100%-0.5rem)]">
          <span
            className="inline-flex items-center px-1.5 py-0.5 lg:px-2 lg:py-1 tv:px-2.5 tv:py-1 rounded-[var(--ds-radius-sm)] text-[10px] lg:text-xs tv:text-sm font-semibold truncate border transition-all duration-200 shadow-sm"
            style={{
              backgroundColor: 'var(--ds-accent-violet-muted)',
              color: 'var(--ds-accent-violet)',
              borderColor: 'var(--ds-accent-violet)',
            }}
            title={item.indexerName || undefined}
          >
            {item.indexerName && item.indexerName.trim() ? item.indexerName.trim() : 'Popcorn'}
          </span>
        </div>

        {/* Icône de complétion en haut à droite */}
        {isCompleted && (
          <div className="absolute top-1 right-1 lg:top-2 lg:right-2 tv:top-3 tv:right-3 z-10">
            <div className="w-6 h-6 lg:w-8 lg:h-8 tv:w-12 tv:h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white/30">
              <CheckCircle2 className="w-4 h-4 lg:w-5 lg:h-5 tv:w-8 tv:h-8 text-white" size={20} />
            </div>
          </div>
        )}

        {/* Badge de disponibilité + Stats temps réel (Seeds/Peers) - discret en bas de la tuile */}
        {(item.seeds !== undefined || item.peers !== undefined) && (
          <div className="absolute bottom-2 left-2 lg:bottom-3 lg:left-3 tv:bottom-4 tv:left-4 z-10">
            <div className={`rounded-lg px-2 py-1 tv:px-3 tv:py-1.5 flex items-center gap-2 tv:gap-3 text-xs tv:text-sm text-white flex-wrap ${
              // Couleur de fond basée sur la disponibilité
              item.seeds !== undefined && item.seeds >= 50 
                ? 'bg-green-900/80 border border-green-500/50' // Rapide (50+ seeders)
                : item.seeds !== undefined && item.seeds >= 10 
                  ? 'bg-glass glass-panel' // Normal (10-49 seeders)
                  : item.seeds !== undefined && item.seeds >= 1
                    ? 'bg-amber-900/80 border border-amber-500/50' // Risqué (1-9 seeders)
                    : 'bg-red-900/80 border border-red-500/50' // Indisponible (0 seeders)
            }`}>
              {item.seeds !== undefined && (
                <div className="flex items-center gap-1 shrink-0">
                  <Sprout className={`w-3 h-3 tv:w-4 tv:h-4 flex-shrink-0 ${
                    item.seeds >= 50 ? 'text-green-400' 
                    : item.seeds >= 10 ? 'text-green-400'
                    : item.seeds >= 1 ? 'text-amber-400'
                    : 'text-red-400'
                  }`} size={16} />
                  <span className="font-semibold whitespace-nowrap">{item.seeds}</span>
                </div>
              )}
              {item.seeds !== undefined && item.peers !== undefined && (
                <span className="text-white/50 shrink-0">|</span>
              )}
              {item.peers !== undefined && (
                <div className="flex items-center gap-1 shrink-0">
                  <Users className="w-3 h-3 tv:w-4 tv:h-4 text-blue-400 flex-shrink-0" size={16} />
                  <span className="font-semibold whitespace-nowrap">{item.peers}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Overlay au survol */}
        {showOverlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 pb-10 lg:pb-12 tv:pb-16 transition-opacity pointer-events-none">
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
        
        {/* Barre de progression du téléchargement */}
        {isDownloading && torrentStats && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 tv:h-2 bg-white/10 rounded-b-lg overflow-hidden z-10">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Barre de santé - fine ligne colorée sous la tuile si téléchargement actif (fallback pour compatibilité) */}
        {!isDownloading && item.isDownloading && item.downloadSpeed !== undefined && (
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
