import { useState, useEffect, useRef } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getHighQualityTmdbImageUrl } from '../../../lib/utils/tmdb-images';
import { getDisplayTitle } from '../../../lib/utils/title-display';
import { YouTubeVideoPlayer } from '../../ui/YouTubeVideoPlayer';
import { isTVPlatform } from '../../../lib/utils/device-detection';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../../lib/utils/media-detail-url';
import { contentItemKey } from '../utils/browsePriority';
import {
  claimPreviewTrailer,
  releasePreviewTrailer,
  subscribePreviewTrailer,
  getActivePreviewTrailer,
} from '../utils/previewTrailerStore';

interface HeroSectionProps {
  items: ContentItem[];
  onPlay: (item: ContentItem) => void;
  /** Label du bouton principal (défaut: "► Play New") */
  primaryButtonLabel?: string;
  /** Icône du bouton principal (défaut: icône play) */
  primaryButtonIcon?: preact.ComponentChildren;
  /** Action du bouton principal (défaut: ouvrir la fiche média) */
  onPrimaryAction?: (item: ContentItem) => void | Promise<void>;
  /** Désactiver le bouton principal */
  primaryActionDisabled?: boolean;
  /** Ne pas remonter sous l'élément au-dessus (ex: barre switch) — désactive les marges négatives */
  noOverlap?: boolean;
  /** Taille du hero (default ou large pour dashboard). */
  size?: 'default' | 'large';
}

function hasTrailer(item: ContentItem): boolean {
  return typeof item.trailerKey === 'string' && item.trailerKey.trim().length > 0;
}

/** Un seul média par affichage de page (priorité aux titres avec bande-annonce). */
function pickRandomItem(items: ContentItem[]): ContentItem {
  if (items.length === 1) return items[0];
  const withTrailer = items.filter(hasTrailer);
  const pool = withTrailer.length > 0 ? withTrailer : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Choisit une fois au montage, puis suit l’enrichissement du même titre.
 * Évite le flash index 0 → autre item (effet « plusieurs torrents »).
 */
function useSingleHeroItem(items: ContentItem[]): ContentItem | null {
  const lockedKeyRef = useRef<string | null>(null);

  if (!items.length) {
    lockedKeyRef.current = null;
    return null;
  }

  if (lockedKeyRef.current) {
    const stillThere = items.find((item) => contentItemKey(item) === lockedKeyRef.current);
    if (stillThere) return stillThere;
  }

  const picked = pickRandomItem(items);
  lockedKeyRef.current = contentItemKey(picked);
  return picked;
}

export function HeroSection({
  items,
  onPlay,
  primaryButtonLabel,
  primaryButtonIcon,
  onPrimaryAction,
  primaryActionDisabled = false,
  noOverlap = false,
  size = 'default',
}: HeroSectionProps) {
  const { t } = useI18n();
  const currentItem = useSingleHeroItem(items);
  const [wantTrailer, setWantTrailer] = useState(true);
  const [trailerReady, setTrailerReady] = useState(false);

  useEffect(() => {
    if (!currentItem) return;
    const heroSlot = `hero:${contentItemKey(currentItem)}`;
    const trailerKey =
      typeof currentItem.trailerKey === 'string' && currentItem.trailerKey.trim().length > 0
        ? currentItem.trailerKey.trim()
        : null;

    setTrailerReady(false);

    if (trailerKey) {
      claimPreviewTrailer(heroSlot);
      setWantTrailer(getActivePreviewTrailer() === heroSlot);
    } else {
      releasePreviewTrailer(heroSlot);
      setWantTrailer(false);
    }

    return () => {
      releasePreviewTrailer(heroSlot);
    };
  }, [currentItem?.id, currentItem?.trailerKey]);

  // Pause hero si une carte preview monopolise le trailer ; reprendre à la libération
  useEffect(() => {
    if (!currentItem) return;
    const heroSlot = `hero:${contentItemKey(currentItem)}`;
    const itemHasTrailer = hasTrailer(currentItem);

    return subscribePreviewTrailer((activeId) => {
      if (activeId === heroSlot) {
        setWantTrailer(true);
        return;
      }
      if (activeId?.startsWith('card:')) {
        setWantTrailer(false);
        setTrailerReady(false);
        return;
      }
      if (activeId == null && itemHasTrailer) {
        claimPreviewTrailer(heroSlot);
        setWantTrailer(true);
      }
    });
  }, [currentItem?.id, currentItem?.trailerKey]);

  if (!items || items.length === 0 || !currentItem) {
    return null;
  }

  const getItemUrl = (item: ContentItem) => {
    if (item.id?.startsWith('tmdb-') && item.tmdbId) {
      return `/discover?tmdbId=${item.tmdbId}&type=${item.type}`;
    }
    return buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');
  };

  const handleMoreInfo = (item: ContentItem) => {
    window.location.href = getItemUrl(item);
  };

  const handlePlay = () => {
    window.location.href = getItemUrl(currentItem);
  };

  const resolvedPrimaryLabel = primaryButtonLabel ?? t('dashboard.playNew');

  const handlePrimaryAction = async () => {
    if (primaryActionDisabled) return;
    if (onPrimaryAction) {
      await onPrimaryAction(currentItem);
      return;
    }
    handlePlay();
  };

  const rawImageUrl = currentItem.backdrop || currentItem.poster;
  const currentImageUrl = getHighQualityTmdbImageUrl(rawImageUrl) ?? rawImageUrl;
  const currentTrailerKey =
    typeof currentItem.trailerKey === 'string' && currentItem.trailerKey.trim().length > 0
      ? currentItem.trailerKey.trim()
      : null;
  const showTrailer = wantTrailer && Boolean(currentTrailerKey);
  const isTV = isTVPlatform();
  const isLargeHero = size === 'large';
  const currentSignal = currentItem.heroSignal;
  const heroNewEpisodeLabel = t('dashboard.heroNewEpisode');
  const heroRequestDownloadedLabel = t('dashboard.heroRequestDownloaded');
  const heroDownloadedUnseenLabel = t('dashboard.heroDownloadedUnseen');
  const itemKey = contentItemKey(currentItem);

  const tvHeroHeight = isLargeHero ? 'max(82vh, 560px)' : 'clamp(380px, 62vh, 680px)';
  const heroHeight = isTV
    ? tvHeroHeight
    : isLargeHero
      ? 'clamp(420px, 68vh, 780px)'
      : 'clamp(380px, 60vh, 700px)';

  const backdropLayer = (
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: currentImageUrl ? `url(${currentImageUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        animation: 'ken-burns 20s ease-out forwards',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/65 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
    </div>
  );

  const trailerLayer =
    showTrailer && currentTrailerKey ? (
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          trailerReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <YouTubeVideoPlayer
          youtubeKey={currentTrailerKey}
          autoplay={true}
          muted={false}
          loop={false}
          controls={false}
          cover={true}
          className="w-full h-full"
          onReady={() => setTrailerReady(true)}
          onEnded={() => {
            setWantTrailer(false);
            setTrailerReady(false);
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/65 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
      </div>
    ) : null;

  const metaBadges = (
    <div className={`flex flex-wrap items-center gap-2 sm:gap-3 text-white/95 ${isTV && isLargeHero ? 'text-lg tv:text-xl' : ''}`}>
      <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide">
        {currentItem.type === 'movie'
          ? t('common.film')
          : currentItem.type === 'tv'
            ? t('common.serie')
            : t('common.content')}
      </span>
      {currentSignal?.downloadedUnseen && (
        <>
          <span className="text-white/50">•</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-300/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wide">
            {heroDownloadedUnseenLabel}
          </span>
        </>
      )}
      {currentSignal?.requestDownloaded && (
        <>
          <span className="text-white/50">•</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wide">
            {heroRequestDownloadedLabel}
          </span>
        </>
      )}
      {currentSignal?.newEpisode && (
        <>
          <span className="text-white/50">•</span>
          <span className="px-2 py-0.5 rounded-full bg-violet-500/30 border border-violet-300/50 text-[10px] sm:text-xs font-semibold uppercase tracking-wide">
            {heroNewEpisodeLabel}
          </span>
        </>
      )}
      {(currentItem.year ??
        (currentItem.releaseDate ? String(currentItem.releaseDate).slice(0, 4) : null)) && (
        <>
          <span className="text-white/50">•</span>
          <span className="text-xs sm:text-sm">
            {currentItem.year ?? String(currentItem.releaseDate || '').slice(0, 4)}
          </span>
        </>
      )}
      {currentItem.rating != null && (
        <>
          <span className="text-white/50">•</span>
          <span className="text-xs sm:text-sm">⭐ {Number(currentItem.rating).toFixed(1)}</span>
        </>
      )}
    </div>
  );

  const titleBlock = (
    <>
      {currentItem.logo && (
        <img
          src={currentItem.logo}
          alt=""
          className="max-h-7 sm:max-h-8 md:max-h-10 lg:max-h-12 w-auto object-contain object-left drop-shadow-2xl"
          style={{ maxWidth: 'min(14rem, 60vw)' }}
        />
      )}
      <h1
        className={`font-bold drop-shadow-2xl line-clamp-2 ${
          currentItem.logo
            ? 'text-base sm:text-lg md:text-xl lg:text-2xl tv:text-3xl text-white/95'
            : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl tv:text-5xl text-white'
        }`}
      >
        {getDisplayTitle(currentItem) || currentItem.title || ''}
      </h1>
      {currentItem.overview && (
        <p className="text-xs sm:text-sm tv:text-base text-white/80 line-clamp-2 drop-shadow-lg max-w-xl">
          {currentItem.overview}
        </p>
      )}
    </>
  );

  const actionButtons = (
    <div className={`flex flex-col gap-3 tv:gap-6 ${isTV ? '' : 'xs:flex-row'}`}>
      <button
        onClick={handlePrimaryAction}
        data-focusable
        data-tv-initial-focus
        data-tv-item-key={itemKey}
        tabIndex={0}
        disabled={primaryActionDisabled}
        aria-busy={primaryActionDisabled}
        className="w-full xs:w-auto gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center justify-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base tv:text-xl tv:px-10 tv:py-5 tv:min-h-[68px] font-bold border border-violet-500/40 hover:border-violet-400/60 hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {primaryButtonIcon ?? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        {resolvedPrimaryLabel}
      </button>
      <button
        onClick={() => handleMoreInfo(currentItem)}
        data-focusable
        tabIndex={0}
        className="w-full xs:w-auto gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center justify-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base tv:text-xl tv:px-8 tv:py-4 tv:min-h-[68px]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t('common.details')}
      </button>
    </div>
  );

  return (
    <div
      className={`hero-dashboard relative z-0 w-full mb-8 ${
        isLargeHero && !isTV
          ? 'px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-3 sm:pt-4 md:pt-5 lg:pt-6'
          : isLargeHero
            ? 'pt-4 tv:pt-6'
            : ''
      }`}
      data-dark-context
      data-hero-item-key={itemKey}
    >
      <div
        className={`relative w-full overflow-hidden ${isLargeHero && !isTV ? 'rounded-2xl border border-white/10' : ''}`}
        style={{ height: heroHeight }}
      >
        <style>{`
          @keyframes ken-burns {
            from { transform: scale(1); }
            to { transform: scale(1.05); }
          }
          .hero-slide-enter {
            animation: hero-content-fade 0.45s ease-out forwards;
          }
          @keyframes hero-content-fade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>

        {/* Un seul titre : image immédiatement, trailer en fondu quand prêt */}
        {backdropLayer}
        {trailerLayer}

        {isLargeHero ? (
          <div className="absolute inset-0 z-10 flex flex-col pt-8 hero-slide-enter">
            <div
              className={`flex-1 min-h-0 flex flex-col justify-end pb-3 overflow-hidden ${
                isTV ? 'px-12 tv:px-24' : 'px-4 sm:px-6 lg:px-16'
              }`}
            >
              <div className="max-w-2xl tv:max-w-4xl w-full flex flex-col gap-2 sm:gap-4 tv:gap-6">
                {metaBadges}
                {titleBlock}
              </div>
            </div>
            <div
              className={`flex-shrink-0 py-3 sm:py-4 bg-gradient-to-t from-black/95 via-black/85 to-transparent backdrop-blur-[2px] ${
                isTV ? 'px-12 tv:px-24' : 'px-4 sm:px-6 lg:px-16'
              }`}
            >
              <div className="max-w-2xl tv:max-w-4xl w-full flex flex-col sm:flex-row sm:items-center sm:justify-start gap-3">
                {actionButtons}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`absolute inset-0 z-10 flex flex-col hero-slide-enter ${
              !noOverlap ? 'mt-8 sm:mt-20 md:mt-32' : ''
            }`}
          >
            <div className="flex-1 min-h-0 flex flex-col justify-end px-4 sm:px-6 lg:px-16 tv:px-24 pb-3 overflow-hidden">
              <div className="max-w-2xl tv:max-w-3xl w-full flex flex-col gap-2 sm:gap-3">
                {metaBadges}
                {titleBlock}
              </div>
            </div>
            <div className="flex-shrink-0 px-4 sm:px-6 lg:px-16 tv:px-24 py-3 sm:py-4 bg-gradient-to-t from-black/95 via-black/85 to-transparent backdrop-blur-[2px]">
              <div className="max-w-2xl tv:max-w-3xl w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {actionButtons}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
