import { useState, useEffect } from 'preact/hooks';
import type { EnrichedResumeItem } from '../hooks/useResumeWatching';
import { FocusableCard } from '../../ui/FocusableCard';
import { useI18n } from '../../../lib/i18n/useI18n';

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
        <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] overflow-hidden bg-gray-900/85 border border-white/15 shadow-lg rounded-lg transform transition-all duration-200 ease-out hover:scale-[1.02] focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1 focus-within:ring-offset-black will-change-transform">
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

          {/* Badge statut (Nouveau / Prochain : date) en haut à droite */}
          {badge ? (
            <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wide shadow-lg" >
              <span className={`px-2 py-0.5 rounded-md ${badge.className}`}>{badge.label}</span>
            </div>
          ) : null}

          {/* Dégradé bas + barre de progression (toujours visible si > 0) */}
          {progress > 0 ? (
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
            <div className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] sm:text-xs font-semibold tracking-wide">
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
