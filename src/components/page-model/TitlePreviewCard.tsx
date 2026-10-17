import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import type { ContentItem } from '../../lib/client/types';
import { getDisplayTitle } from '../../lib/utils/title-display';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { YouTubeVideoPlayer } from '../ui/YouTubeVideoPlayer';
import { FocusableCard } from '../ui/FocusableCard';
import {
  claimPreviewTrailer,
  releasePreviewTrailer,
  subscribePreviewTrailer,
} from '../dashboard/utils/previewTrailerStore';
import { contentItemKey } from '../dashboard/utils/browsePriority';
import { reanchorBrowseSlot } from './browseCarouselAnchor';
import { cardBackdropUrl, cardPosterUrl } from '../../lib/utils/tmdb-images';
import { useMovieWatchState } from '../../lib/watchedMovies';
import { useI18n } from '../../lib/i18n';
import {
  ensureBrowseInputModalityTracking,
  isBrowseKeyboardFocus,
} from './browseInputModality';

export { reanchorBrowseSlot, ensureBrowseRowInView } from './browseCarouselAnchor';

/** Délai avant lecture trailer : évite le chargement à chaque flèche. */
const TRAILER_DELAY_MS = 2500;
/** TV : délai avant d'armer l'état trailer (le timer TRAILER_DELAY_MS démarre ensuite). Évite tout rendu pendant un défilement rapide. */
const TV_TRAILER_ARM_MS = 400;

/**
 * Hauteur image — paysage focus ≈ 55 % de la largeur utile (réf. streaming TV).
 */
export function computeBrowseTileHeight(): number {
  if (typeof window === 'undefined') return 460;
  const w = window.innerWidth;
  const vh = window.innerHeight;
  const tv = isTVPlatform();

  const padX = tv
    ? Math.max(w * 0.05, 72) * 2
    : w >= 1280
      ? 160
      : w >= 768
        ? 80
        : 40;
  const usableW = Math.max(320, w - padX);

  const landscapeW = usableW * (tv ? 0.55 : 0.52);
  let tileH = Math.round((landscapeW * 9) / 16);

  const maxByVh = Math.round(vh * (tv ? 0.5 : 0.48));
  const minH = tv ? 400 : w < 640 ? 240 : w < 1024 ? 340 : 400;
  const maxH = tv ? 620 : 560;
  return Math.min(maxH, Math.max(minH, Math.min(maxByVh, tileH)));
}

/**
 * Hauteur de tuile partagée : UN seul jeu d'écouteurs (resize / orientation / attributs TV)
 * pour toutes les cartes, au lieu d'un MutationObserver + 2 listeners par carte.
 */
let sharedTileH: number | null = null;
const tileHSubscribers = new Set<(h: number) => void>();
let tileHListening = false;

function syncSharedTileHeight(): void {
  const next = computeBrowseTileHeight();
  if (next === sharedTileH) return;
  sharedTileH = next;
  tileHSubscribers.forEach((fn) => fn(next));
}

function ensureTileHeightListeners(): void {
  if (tileHListening || typeof window === 'undefined') return;
  tileHListening = true;
  window.addEventListener('resize', syncSharedTileHeight);
  window.addEventListener('orientationchange', syncSharedTileHeight);
  const mo = new MutationObserver(syncSharedTileHeight);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tv-platform', 'data-webos'],
  });
}

function useTileHeight(): number {
  const [h, setH] = useState(() => {
    if (sharedTileH == null) sharedTileH = computeBrowseTileHeight();
    return sharedTileH;
  });

  useEffect(() => {
    ensureTileHeightListeners();
    tileHSubscribers.add(setH);
    if (sharedTileH != null && sharedTileH !== h) setH(sharedTileH);
    return () => {
      tileHSubscribers.delete(setH);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return h;
}

interface TitlePreviewCardProps {
  item: ContentItem;
  onNavigate: (item: ContentItem) => void;
  progress?: number;
  /** Affiche la barre même à 0 % (téléchargement en cours). */
  downloading?: boolean;
  metaLine?: string | null;
  metaSubLine?: string | null;
  /** Pastille courte sur l'affiche (disponible, demandé, en attente). */
  badge?: string | null;
  badgeTone?: 'ok' | 'pending' | 'bad' | 'neutral';
}

/**
 * Tuile browse :
 * - souris : portrait + léger hover
 * - flèches / télécommande : paysage ancré à gauche (même poster, pas de backdrop)
 * - trailer : seulement après ~2,5 s sur la même carte
 */
function TitlePreviewCardImpl({
  item,
  onNavigate,
  progress,
  downloading = false,
  metaLine,
  metaSubLine,
  badge,
  badgeTone = 'neutral',
}: TitlePreviewCardProps) {
  const slotId = `card:${contentItemKey(item)}`;
  const { t } = useI18n();
  const isMovie = item.type === 'movie';
  const movieWatch = useMovieWatchState(isMovie ? item.tmdbId : null, isMovie);
  const tileH = useTileHeight();
  const slotRef = useRef<HTMLDivElement>(null);
  const delayRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  /** Expand paysage : uniquement après focus clavier / télécommande. */
  const [remoteFocused, setRemoteFocused] = useState(false);
  const [playTrailer, setPlayTrailer] = useState(false);
  const [trailerReady, setTrailerReady] = useState(false);

  const trailerKey =
    typeof item.trailerKey === 'string' && item.trailerKey.trim().length > 0
      ? item.trailerKey.trim()
      : null;
  // Au moins une image requise pour afficher la tuile.
  const poster = item.poster || item.backdrop;
  const title = getDisplayTitle(item);
  const tvLayout = isTVPlatform();
  /**
   * TV : le focus télécommande ne déclenche AUCUN rendu (attribut DOM data-preview-expanded
   * posé directement) — la tuile est déjà en paysage, seule la bande-annonce (après délai)
   * provoque un rendu de CETTE carte. Hors TV : état React (passage portrait → paysage).
   */
  const expanded = tvLayout ? false : remoteFocused;
  const [tvTrailerFocus, setTvTrailerFocus] = useState(false);
  const trailerActive = tvLayout ? tvTrailerFocus : expanded;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const itemRef = useRef(item);
  itemRef.current = item;
  const handleClick = useCallback(() => onNavigateRef.current(itemRef.current), []);

  useEffect(() => {
    ensureBrowseInputModalityTracking();
  }, []);

  const clearDelay = useCallback(() => {
    if (delayRef.current != null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  // Trailer uniquement si l’utilisateur reste sur la carte
  useEffect(() => {
    if (!trailerActive || !trailerKey) {
      clearDelay();
      setPlayTrailer(false);
      setTrailerReady(false);
      releasePreviewTrailer(slotId);
      return;
    }
    clearDelay();
    setPlayTrailer(false);
    setTrailerReady(false);
    delayRef.current = window.setTimeout(() => {
      claimPreviewTrailer(slotId);
      setPlayTrailer(true);
    }, TRAILER_DELAY_MS);
    return () => clearDelay();
  }, [trailerActive, clearDelay, slotId, trailerKey]);

  useEffect(() => {
    return subscribePreviewTrailer((activeId) => {
      if (activeId !== slotId) {
        setPlayTrailer(false);
        setTrailerReady(false);
      }
    });
  }, [slotId]);

  useEffect(() => {
    return () => {
      clearDelay();
      releasePreviewTrailer(slotId);
    };
  }, [clearDelay, slotId]);

  // TV : largeur fixe. Changer portrait → paysage à chaque flèche recalcule toute la rangée.
  const tileW = tvLayout || expanded ? Math.round((tileH * 16) / 9) : Math.round((tileH * 2) / 3);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const tv = isTVPlatform();
    // TV : focus = classe/attribut DOM seulement (pas de setState → pas de re-render de rangée).
    // La bande-annonce n'est armée qu'après TV_TRAILER_ARM_MS sur la même carte.
    let tvArmTimer: number | null = null;
    const setTvExpanded = (on: boolean) => {
      slot.setAttribute('data-preview-expanded', on ? 'true' : 'false');
      if (tvArmTimer != null) {
        window.clearTimeout(tvArmTimer);
        tvArmTimer = null;
      }
      if (on) {
        // Ancrage gauche (équivalent de l'effet `expanded` hors TV), sans rendu.
        requestAnimationFrame(() => reanchorBrowseSlot(slot));
        tvArmTimer = window.setTimeout(() => {
          tvArmTimer = null;
          setTvTrailerFocus(true);
        }, TV_TRAILER_ARM_MS);
      } else {
        setTvTrailerFocus(false);
      }
    };
    if (tv) slot.setAttribute('data-preview-expanded', 'false');
    const onFocusIn = () => {
      if (tv) {
        if (slot.getAttribute('data-preview-expanded') !== 'true') setTvExpanded(true);
        return;
      }
      if (!isBrowseKeyboardFocus()) {
        setRemoteFocused(false);
        return;
      }
      setRemoteFocused(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && slot.contains(next)) return;
      if (tv) {
        setTvExpanded(false);
        return;
      }
      setRemoteFocused(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'Enter' ||
        e.key === ' '
      ) {
        if (tv) {
          if (slot.getAttribute('data-preview-expanded') !== 'true') setTvExpanded(true);
          return;
        }
        setRemoteFocused(true);
      }
    };
    slot.addEventListener('focusin', onFocusIn);
    slot.addEventListener('focusout', onFocusOut);
    slot.addEventListener('keydown', onKeyDown);
    return () => {
      slot.removeEventListener('focusin', onFocusIn);
      slot.removeEventListener('focusout', onFocusOut);
      slot.removeEventListener('keydown', onKeyDown);
      if (tvArmTimer != null) window.clearTimeout(tvArmTimer);
    };
  }, []);

  // Ancrage gauche après expand (1 rAF — le layout paysage doit être painté)
  useEffect(() => {
    if (!expanded) return;
    const slot = slotRef.current;
    if (!slot) return;
    const id = requestAnimationFrame(() => reanchorBrowseSlot(slot));
    return () => cancelAnimationFrame(id);
  }, [expanded, tileW]);

  if (!poster) return null;

  // Cadrage : format paysage (TV ou focus télécommande) = backdrop 16:9 ; portrait = affiche 2:3.
  // Si l'image du bon format manque, l'autre est affichée entière (contain) sur un fond flouté.
  const landscape = tvLayout || expanded;
  const preferred = landscape ? item.backdrop : item.poster;
  const imgSrc = preferred
    ? landscape ? cardBackdropUrl(preferred) : cardPosterUrl(preferred)
    : landscape ? cardPosterUrl(item.poster) : cardBackdropUrl(item.backdrop);
  const imgFit = preferred ? 'cover' : 'contain';

  const progressPct = (() => {
    if (typeof progress !== 'number') return 0;
    if (!downloading && progress <= 0) return 0;
    // Téléchargements / ContentItem : déjà en 0–100. Fraction 0–1 seulement en legacy lecture.
    const p = downloading || progress > 1 ? progress : progress * 100;
    return Math.min(100, Math.max(0, p));
  })();
  // Films : reprise (barre corail + « Reprendre · NN % ») si aucune progression explicite fournie.
  const movieResumePct =
    !downloading && !movieWatch.watched && movieWatch.resumePercent != null ? movieWatch.resumePercent : null;
  const effectiveProgressPct = progressPct > 0 ? progressPct : movieResumePct ?? 0;
  const showProgressBar = downloading || effectiveProgressPct > 0;
  const hasExplicitMeta = Boolean(metaLine || metaSubLine);
  const showCaption = hasExplicitMeta || expanded || tvLayout || hovered;
  const captionTitle = metaLine || title;
  const captionSub =
    metaSubLine ||
    (!hasExplicitMeta && item.rating != null ? `★ ${item.rating.toFixed(1)}` : null);

  return (
    <div
      ref={slotRef}
      className="relative flex flex-col shrink-0"
      style={{
        flex: `0 0 ${tileW}px`,
        width: `${tileW}px`,
        minWidth: `${tileW}px`,
        maxWidth: `${tileW}px`,
      }}
      data-browse-tile
      data-browse-slot
      data-preview-expanded={tvLayout ? undefined : expanded ? 'true' : 'false'}
      data-tv-item-key={contentItemKey(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FocusableCard
        className={[
          'ed-browse-card block w-full outline-none relative overflow-hidden rounded-md bg-[#141414]',
          tvLayout ? '' : 'ed-motion-card',
          expanded
            ? ''
            : hovered
              ? 'z-[2] scale-[1.03] shadow-[0_12px_28px_rgba(0,0,0,0.45)]'
              : 'shadow-none',
        ].join(' ')}
        style={{ width: '100%', height: tileH }}
        ariaLabel={captionSub ? `${captionTitle}. ${captionSub}` : captionTitle}
        noScale
        asTorrentCard
        onClick={handleClick}
      >
        {badge ? (
          <span
            className={[
              'absolute left-2 top-2 z-[4] rounded-full border px-2.5 py-1 text-[10px] tv:text-sm font-bold uppercase tracking-wide text-white',
              badgeTone === 'ok'
                ? 'border-emerald-200/40 bg-emerald-600/90'
                : badgeTone === 'pending'
                  ? 'border-amber-100/40 bg-amber-500/90'
                  : badgeTone === 'bad'
                    ? 'border-rose-200/40 bg-rose-600/90'
                    : 'border-white/20 bg-black/70',
            ].join(' ')}
          >
            {badge}
          </span>
        ) : null}

        {isMovie && movieWatch.watched && !downloading ? (
          <span
            className="ed-card-watched absolute right-2 top-2 z-[4] inline-flex h-7 w-7 tv:h-9 tv:w-9 items-center justify-center rounded-full border border-[var(--ed-accent,#f2545b)]/70 bg-black/60"
            title={t('playback.movieWatched')}
            aria-label={t('playback.movieWatched')}
            data-movie-watched
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 tv:h-5 tv:w-5" fill="none" stroke="var(--ed-accent,#f2545b)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        ) : null}
        {movieResumePct != null && progressPct <= 0 ? (
          <span className="ed-card-resume absolute left-2 bottom-3 z-[4] rounded-sm border border-white/20 bg-black/65 px-2 py-0.5 text-[10px] tv:text-xs uppercase tracking-[0.2em] text-white/90">
            {t('playback.resumeLabel')} · {movieResumePct}%
          </span>
        ) : null}

        <div className="absolute inset-0" aria-hidden>
          {imgFit === 'contain' ? (
            <img
              src={imgSrc ?? poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="ed-card-img-fallback-bg absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <img
            src={imgSrc ?? poster}
            alt=""
            loading="lazy"
            decoding="async"
            className={`ed-card-img absolute inset-0 h-full w-full ${
              imgFit === 'cover'
                ? `object-cover ${landscape ? 'object-[center_top]' : 'object-center'}`
                : 'object-contain'
            }`}
          />

          {playTrailer && trailerActive && trailerKey ? (
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-300 ${
                trailerReady ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <YouTubeVideoPlayer
                youtubeKey={trailerKey}
                autoplay
                muted={false}
                loop
                controls={false}
                cover
                className="!absolute inset-0 !h-full !w-full !aspect-auto"
                onReady={() => setTrailerReady(true)}
              />
            </div>
          ) : null}
        </div>

        {showCaption ? (
          <div
            className={`ed-browse-card__caption pointer-events-none absolute inset-x-0 bottom-0 z-[3] ${
              showProgressBar ? 'ed-browse-card__caption--with-progress' : ''
            }`}
          >
            <div className="ed-browse-card__shade" aria-hidden />
            <div className="ed-browse-card__copy relative">
              <p className="ed-browse-card__title truncate">{captionTitle}</p>
              {captionSub ? (
                <p className="ed-browse-card__sub truncate">{captionSub}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {showProgressBar ? (
          <div
            className={`ed-browse-card__progress absolute inset-x-0 bottom-0 z-[4] ${
              downloading ? 'h-1.5 bg-black/55' : 'h-[3px] bg-white/25'
            }`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(effectiveProgressPct)}
          >
            <div
              className={`h-full transition-[width] duration-500 ease-out bg-[var(--ed-accent,#f2545b)] ${
                downloading ? 'shadow-[0_0_10px_rgba(242,84,91,0.45)]' : ''
              }`}
              style={{
                width: `${Math.max(effectiveProgressPct, downloading && effectiveProgressPct === 0 ? 2 : 0)}%`,
              }}
            />
          </div>
        ) : null}
      </FocusableCard>
    </div>
  );
}

function sameCardProps(a: TitlePreviewCardProps, b: TitlePreviewCardProps): boolean {
  if (a.item !== b.item) {
    const ia = a.item;
    const ib = b.item;
    if (
      contentItemKey(ia) !== contentItemKey(ib) ||
      ia.poster !== ib.poster ||
      ia.backdrop !== ib.backdrop ||
      ia.trailerKey !== ib.trailerKey ||
      ia.rating !== ib.rating ||
      getDisplayTitle(ia) !== getDisplayTitle(ib)
    ) {
      return false;
    }
  }
  return (
    a.progress === b.progress &&
    a.downloading === b.downloading &&
    a.metaLine === b.metaLine &&
    a.metaSubLine === b.metaSubLine &&
    a.badge === b.badge &&
    a.badgeTone === b.badgeTone
  );
}

/**
 * Carte mémoïsée : un rendu du parent (rangée, page, polling téléchargements, hero)
 * ne re-rend que les cartes dont les données visibles changent. `onNavigate` est lu
 * via ref (toujours la dernière valeur au clic) et n'invalide pas la mémo.
 */
export const TitlePreviewCard = memo(TitlePreviewCardImpl, sameCardProps);
