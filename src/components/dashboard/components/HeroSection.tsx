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

function LegacyHeroSection({
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
    <div
      data-stream-item
      className={`flex flex-wrap items-center gap-2 sm:gap-3 text-white/95 ${isTV && isLargeHero ? 'text-lg tv:text-xl' : ''}`}
    >
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
          data-stream-item
          src={currentItem.logo}
          alt=""
          className="max-h-7 sm:max-h-8 md:max-h-10 lg:max-h-12 w-auto object-contain object-left drop-shadow-2xl"
          style={{ maxWidth: 'min(14rem, 60vw)' }}
        />
      )}
      <h1
        data-stream-item
        className={`font-bold drop-shadow-2xl line-clamp-2 ${
          currentItem.logo
            ? 'text-base sm:text-lg md:text-xl lg:text-2xl tv:text-3xl text-white/95'
            : 'text-xl sm:text-2xl md:text-3xl lg:text-4xl tv:text-5xl text-white'
        }`}
      >
        {getDisplayTitle(currentItem) || currentItem.title || ''}
      </h1>
      {currentItem.overview && (
        <p data-stream-item className="text-xs sm:text-sm tv:text-base text-white/80 line-clamp-2 drop-shadow-lg max-w-xl">
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
            from { transform: scale(1) translate3d(0, 0, 0); }
            to { transform: scale(1.08) translate3d(-1.5%, -0.5%, 0); }
          }
          .hero-slide-enter {
            animation: hero-content-fade 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          @keyframes hero-content-fade {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .hero-slide-enter { animation: none; opacity: 1; transform: none; }
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
              <div className="max-w-2xl tv:max-w-4xl w-full flex flex-col gap-2 sm:gap-4 tv:gap-6 ds-stream-cascade">
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
              <div className="max-w-2xl tv:max-w-3xl w-full flex flex-col gap-2 sm:gap-3 ds-stream-cascade">
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

/* ───────────────────────── Editorial hero (web / mobile, hors TV) ───────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, '0');

function EditorialHeroSection({
  items,
  primaryButtonLabel,
  primaryButtonIcon,
  onPrimaryAction,
  primaryActionDisabled = false,
  size = 'default',
}: HeroSectionProps) {
  const { t } = useI18n();
  const slides = useRef<ContentItem[]>([]);
  // Fige la sélection (max 5) dès le premier rendu, suit l'enrichissement des mêmes titres.
  if (slides.current.length === 0 && items.length > 0) {
    const withImg = items.filter((i) => i.backdrop || i.poster);
    slides.current = (withImg.length ? withImg : items).slice(0, 5);
  }
  const keys = slides.current.map(contentItemKey);
  const list = keys
    .map((k) => items.find((i) => contentItemKey(i) === k) ?? slides.current.find((i) => contentItemKey(i) === k))
    .filter(Boolean) as ContentItem[];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const isTV = isTVPlatform();
  const count = list.length;
  /** TV : aperçu bande-annonce (avec son) dans le hero quand le focus y reste ~2 s. */
  const [previewOn, setPreviewOn] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const countRef = useRef(count);
  countRef.current = count;

  /**
   * TV (télécommande) : gauche/droite change de titre au lieu de passer d'un bouton à l'autre.
   * TVNavigationProvider émet `tv-hero-cycle` quand le focus est dans [data-tv-hero-cycle].
   */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !isTV) return;
    const onCycle = (e: Event) => {
      const n = countRef.current;
      if (n < 2) return;
      const delta = Number((e as CustomEvent<{ delta?: number }>).detail?.delta) < 0 ? -1 : 1;
      setTrailerOpen(false);
      setIndex((i) => (i + delta + n) % n);
    };
    el.addEventListener('tv-hero-cycle', onCycle as EventListener);
    return () => el.removeEventListener('tv-hero-cycle', onCycle as EventListener);
  }, [isTV]);

  useEffect(() => {
    if (count < 2 || paused || focusWithin || trailerOpen) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 9000);
    return () => clearInterval(id);
  }, [count, paused, focusWithin, trailerOpen]);

  useEffect(() => {
    if (!trailerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // Échap (web) / Retour télécommande (webOS 461, Android TV GoBack)
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 461) {
        e.preventDefault();
        e.stopPropagation();
        setTrailerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    const t0 = setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      clearTimeout(t0);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [trailerOpen]);

  const currentKeyForPreview = count ? contentItemKey(list[Math.min(index, count - 1)]) : '';
  const currentTrailerForPreview = count ? list[Math.min(index, count - 1)].trailerKey : null;
  useEffect(() => {
    setPreviewOn(false);
    if (!isTV || !focusWithin || trailerOpen || !currentTrailerForPreview) return;
    const id = window.setTimeout(() => setPreviewOn(true), 2000);
    return () => window.clearTimeout(id);
  }, [isTV, focusWithin, trailerOpen, currentKeyForPreview, currentTrailerForPreview]);

  if (!count) return null;
  const current = list[Math.min(index, count - 1)];
  const go = (d: number) => {
    setTrailerOpen(false);
    setIndex((i) => (i + d + count) % count);
  };

  const getItemUrl = (item: ContentItem) =>
    item.id?.startsWith('tmdb-') && item.tmdbId
      ? `/discover?tmdbId=${item.tmdbId}&type=${item.type}`
      : buildStrictTmdbDetailUrlFromContentItem(item, 'dashboard');

  const handlePrimary = async () => {
    if (primaryActionDisabled) return;
    if (onPrimaryAction) return void (await onPrimaryAction(current));
    window.location.href = getItemUrl(current);
  };

  const trailerKey =
    typeof current.trailerKey === 'string' && current.trailerKey.trim() ? current.trailerKey.trim() : null;
  const year = current.year ?? (current.releaseDate ? String(current.releaseDate).slice(0, 4) : null);
  const kindLabel =
    current.type === 'movie' ? t('common.film') : current.type === 'tv' ? t('common.serie') : t('common.content');
  const kicker = [kindLabel, year].filter(Boolean).join(' · ');
  const subtitle = (current.genres && current.genres.length ? current.genres.slice(0, 2).join(' / ') : '') ||
    (current.rating != null ? `★ ${Number(current.rating).toFixed(1)}` : '');
  const signal = current.heroSignal;
  const signalLabel = signal?.newEpisode
    ? t('dashboard.heroNewEpisode')
    : signal?.requestDownloaded
      ? t('dashboard.heroRequestDownloaded')
      : signal?.downloadedUnseen
        ? t('dashboard.heroDownloadedUnseen')
        : null;
  const title = getDisplayTitle(current) || current.title || '';

  return (
    <section
      ref={sectionRef}
      className={`ed-hero ${size === 'large' ? 'ed-hero--large' : ''} ${isTV ? 'ed-hero--tv' : ''}`}
      data-dark-context
      data-editorial-hero
      data-tv-hero-cycle={isTV && count > 1 ? '' : undefined}
      data-hero-item-key={contentItemKey(current)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e: FocusEvent) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !(e.currentTarget as HTMLElement).contains(next)) setFocusWithin(false);
      }}
      aria-roledescription="carousel"
    >
      {list.map((item, i) => {
        // Seules l'image active et la suivante sont chargées (5 images pleine taille = décodage lourd sur TV).
        const near = i === index || i === (index + 1) % count || i === (index - 1 + count) % count;
        const raw = item.backdrop || item.poster;
        const url = near ? getHighQualityTmdbImageUrl(raw) ?? raw : null;
        return (
          <div
            key={contentItemKey(item)}
            className={`ed-hero__bg ${i === index ? 'is-active' : ''}`}
            style={{ backgroundImage: url ? `url(${url})` : 'none' }}
            aria-hidden
          />
        );
      })}
      {previewOn && !trailerOpen && trailerKey && (
        <div className="ed-hero__preview" aria-hidden>
          <YouTubeVideoPlayer key={`p-${trailerKey}`} youtubeKey={trailerKey} autoplay muted={false} loop controls={false} cover className="w-full h-full" />
        </div>
      )}
      <div className="ed-hero__shade" aria-hidden />
      {trailerOpen && trailerKey && (
        <div className="ed-hero__trailer">
          <YouTubeVideoPlayer youtubeKey={trailerKey} autoplay muted={false} loop={false} controls cover className="w-full h-full" onEnded={() => setTrailerOpen(false)} />
          <button ref={closeRef} type="button" tabIndex={0} className="ed-hero__close" onClick={() => setTrailerOpen(false)} aria-label="Fermer" data-focusable>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      <div className="ed-grid-lines" aria-hidden><span /><span /><span /><span /></div>

      <div className="ed-hero__inner">
        <header key={`h-${contentItemKey(current)}`} className="ed-hero__head ed-fade">
          <p className="ed-kicker">{kicker}</p>
          <h1 className="ed-title">{title}</h1>
        </header>

        <div className="ed-hero__left">
          <div key={`c-${contentItemKey(current)}`} className="ed-fade">
            <div className="ed-number" aria-hidden>
              <span>{pad2(index + 1)}</span>
            </div>
            {subtitle && <p className="ed-subtitle">{subtitle}</p>}
            {signalLabel && <p className="ed-signal">{signalLabel}</p>}
            {current.overview && <p className="ed-synopsis">{current.overview}</p>}
          </div>
          <div className="ed-hero__ctas">
            <button
              type="button"
              className="ed-cta"
              onClick={handlePrimary}
              disabled={primaryActionDisabled}
              aria-busy={primaryActionDisabled}
              tabIndex={0}
              data-focusable
              data-tv-initial-focus
              data-tv-item-key={contentItemKey(current)}
            >
              {primaryButtonIcon}
              <span>{primaryButtonLabel ?? 'Regarder'}</span>
            </button>
            <a
              href={getItemUrl(current)}
              className="ed-link"
              tabIndex={isTV ? -1 : 0}
              data-focusable={isTV ? undefined : true}
              data-tv-nav-skip={isTV ? '' : undefined}
            >
              {t('common.details')}
            </a>
          </div>
        </div>

        {trailerKey && !trailerOpen && (
          <button
            type="button"
            className="ed-play"
            tabIndex={isTV ? -1 : 0}
            onClick={() => setTrailerOpen(true)}
            data-focusable={isTV ? undefined : true}
            data-tv-nav-skip={isTV ? '' : undefined}
          >
            <span className="ed-play__ring">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 7.5v9l7.5-4.5z" /></svg>
            </span>
            <span className="ed-play__label">Bande-annonce</span>
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="ed-pager">
          <span className="ed-pager__num">{pad2(index + 1)}</span>
          <span className="ed-pager__track">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`ed-pager__seg ${i === index ? 'is-active' : ''} ${i < index ? 'is-past' : ''}`}
                onClick={() => setIndex(i)}
                tabIndex={-1}
                aria-label={`${pad2(i + 1)} / ${pad2(count)}`}
              />
            ))}
          </span>
          <span className="ed-pager__num ed-pager__num--dim">{pad2(count)}</span>
          <button type="button" className="ed-arrow" onClick={() => go(-1)} aria-label="Précédent" tabIndex={isTV ? -1 : 0} data-focusable={isTV ? undefined : true} data-tv-nav-skip={isTV ? '' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="ed-arrow" onClick={() => go(1)} aria-label="Suivant" tabIndex={isTV ? -1 : 0} data-focusable={isTV ? undefined : true} data-tv-nav-skip={isTV ? '' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}

/** Hero éditorial partout (web, mobile, TV/webOS). L'ancien rendu reste disponible en secours. */
export function HeroSection(props: HeroSectionProps) {
  return <EditorialHeroSection {...props} />;
}

/** @internal ancien hero (conservé pour retour arrière rapide). */
export const __LegacyHeroSection = LegacyHeroSection;
