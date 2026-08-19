import { useState, useEffect } from 'preact/hooks';
import type { EnrichedResumeItem } from '../hooks/useResumeWatching';
import { FocusableCard } from '../../ui/FocusableCard';
import { useI18n } from '../../../lib/i18n/useI18n';
import { formatSpeed } from '../../../lib/utils/formatBytes';
import { Download } from 'lucide-preact';
import { contentItemKey } from '../utils/browsePriority';

interface ResumePosterProps {
  item: EnrichedResumeItem;
  /** Optionnel : surcharge l'action de clic (sinon navigation vers /torrents avec params). */
  onNavigate?: (item: EnrichedResumeItem) => void;
}

/**
 * Construit l'URL `/torrents?slug=...` avec les query params permettant à
 * MediaDetailPage de pré-sélectionner saison/épisode et de reprendre à la bonne position.
 */
function buildResumeHref(item: EnrichedResumeItem): string {
  const id = item.id || (item.tmdbId != null ? String(item.tmdbId) : '');
  const params = new URLSearchParams();
  params.set('slug', id);
  if (item.tmdbId != null) params.set('tmdbId', String(item.tmdbId));
  if (item.type) params.set('type', item.type);
  if (item.infoHash) params.set('infoHash', item.infoHash);
  if (item.type === 'tv') {
    if (item.currentSeason != null) params.set('season', String(item.currentSeason));
    if (item.currentEpisode != null) params.set('episode', String(item.currentEpisode));
    if (item.variantId) params.set('variantId', item.variantId);
  }
  if (item.positionSeconds != null && item.positionSeconds > 0) {
    params.set('t', String(Math.floor(item.positionSeconds)));
  }
  params.set('from', 'resume');
  return `/torrents?${params.toString()}`;
}

function formatShortDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

function statusBadge(item: EnrichedResumeItem, t: (k: string, p?: Record<string, string>) => string, locale: string): { label: string; className: string } | null {
  if (item.resumeStatus === 'new_episode_available') {
    return {
      label: t('dashboard.newEpisodeBadge'),
      className: 'bg-green-500 text-black',
    };
  }
  if (item.resumeStatus === 'waiting_for_next' && item.nextEpisodeAirDate) {
    return {
      label: t('dashboard.nextEpisodeBadge', { date: formatShortDate(item.nextEpisodeAirDate, locale) }),
      className: 'bg-blue-500 text-white',
    };
  }
  return null;
}

export function ResumePoster({ item, onNavigate }: ResumePosterProps) {
  const i18n = useI18n();
  const t = i18n.t as (k: string, p?: Record<string, string>) => string;
  const locale = (i18n as { language?: string }).language === 'en' ? 'en-US' : 'fr-FR';
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(item.poster || null);

  const playHref = buildResumeHref(item);

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
    if (onNavigate) {
      onNavigate(item);
    } else {
      window.location.href = playHref;
    }
  };

  const progress = item.progress || 0;
  const showOverlay = isHovered || isFocused;
  const badge = statusBadge(item, t, locale ?? 'fr-FR');
  const episodeLabel =
    item.type === 'tv' && item.currentSeason != null && item.currentEpisode != null
      ? `S${item.currentSeason} \u00B7 E${item.currentEpisode}`
      : null;

  return (
    <div
      className="relative group cursor-pointer torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px]"
      data-dark-context
      data-tv-item-key={contentItemKey(item)}
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
        <div className={`relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900/85 border border-white/15 shadow-lg rounded-lg focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1 focus-within:ring-offset-black transform-gpu transition-all duration-[400ms] ease-out hover:z-40 focus-within:z-40 will-change-transform group-hover:scale-[1.04] group-hover:shadow-[0_10px_40px_-10px_rgba(168,85,247,0.4)] group-hover:border-violet-400/50`}>
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
                <p className="text-xs text-gray-400 line-clamp-2">{item.title}</p>
              </div>
            </div>
          )}

          {/* Overlay Premium de Téléchargement (identique aux cartes épisodes) */}
          {item.isDownloading && (
            <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
              {/* Gradient de fond */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/90 to-black transition-opacity duration-500" />
              
              {/* Contenu de l'overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                {/* Anneau de progression ou icône pulsante */}
                <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-3">
                  <div className="absolute inset-0 rounded-full border-2 border-white/5" />
                  <div 
                    className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" 
                    style={{ 
                      animationDuration: '1s',
                      maskImage: `conic-gradient(transparent 20%, black 100%)`
                    }} 
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Download className="w-6 h-6 sm:w-7 sm:h-7 text-primary animate-pulse" />
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-[10px] sm:text-xs font-bold text-white tracking-[0.2em] uppercase mb-1 drop-shadow-md opacity-80">
                    {t('torrents.state.downloading') || 'Téléchargement'}
                  </div>
                  {typeof item.downloadProgress === 'number' && (
                    <div className="text-xl sm:text-2xl font-black text-white drop-shadow-lg tabular-nums">
                      {Math.round(item.downloadProgress)}%
                    </div>
                  )}
                  {item.downloadSpeed && (
                    <div className="text-[9px] sm:text-[10px] text-white/50 uppercase tracking-tighter mt-1 truncate max-w-[180px]">
                      {formatSpeed(item.downloadSpeed)}
                    </div>
                  )}
                </div>
              </div>

              {/* Lueur d'activité en bas */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                <div 
                  className="h-full bg-primary transition-all duration-500 shadow-[0_0_12px_rgba(168,85,247,0.6)]"
                  style={{ width: `${item.downloadProgress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Badge statut (Nouveau / Prochain : date) en haut à droite */}
          {badge ? (
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1 shadow-lg" >
              <span className={`px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${badge.className}`}>
                {badge.icon && <badge.icon size={12} />}
                {badge.label}
              </span>
            </div>
          ) : null}

          {/* Dégradé bas + barre de progression (toujours visible si > 0) */}
          {progress > 0 && !item.isDownloading ? (
            <div className="absolute bottom-0 left-0 right-0 z-10 pb-1">
              <div className="h-1 tv:h-1.5 mx-2 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Label S/E discret en bas à gauche pour les séries */}
          {episodeLabel ? (
            <div className="absolute bottom-2 left-2 z-20 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] sm:text-xs font-semibold tracking-wide flex items-center gap-1.5">
              {episodeLabel}
            </div>
          ) : null}

          {/* Overlay au survol/focus avec titre + % */}
          {showOverlay && (
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-3 lg:p-4 tv:p-6 pb-10 lg:pb-12 tv:pb-16 transition-opacity pointer-events-none">
              <div className="space-y-1 lg:space-y-1.5 tv:space-y-2">
                <h3 className="text-white font-semibold text-sm lg:text-base tv:text-lg line-clamp-1">
                  {item.title}
                </h3>
                <div className="text-xs lg:text-sm tv:text-base text-gray-300">
                  {Math.round(progress)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </FocusableCard>
    </div>
  );
}
