import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
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
import {
  ensureBrowseInputModalityTracking,
  isBrowseKeyboardFocus,
} from './browseInputModality';

export { reanchorBrowseSlot, ensureBrowseRowInView } from './browseCarouselAnchor';

/** Délai avant lecture trailer : évite le chargement à chaque flèche. */
const TRAILER_DELAY_MS = 2500;

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

function useTileHeight(): number {
  const [h, setH] = useState(() => computeBrowseTileHeight());

  useEffect(() => {
    const sync = () => setH(computeBrowseTileHeight());
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tv-platform', 'data-webos'],
    });
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      mo.disconnect();
    };
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
}

/**
 * Tuile browse :
 * - souris : portrait + léger hover
 * - flèches / télécommande : paysage ancré à gauche (même poster, pas de backdrop)
 * - trailer : seulement après ~2,5 s sur la même carte
 */
export function TitlePreviewCard({
  item,
  onNavigate,
  progress,
  downloading = false,
  metaLine,
  metaSubLine,
}: TitlePreviewCardProps) {
  const slotId = `card:${contentItemKey(item)}`;
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
  // Une seule image (poster) : pas de swap backdrop au focus (= réseau / CPU inutiles).
  const poster = item.poster || item.backdrop;
  const title = getDisplayTitle(item);
  const expanded = remoteFocused;

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
    if (!expanded || !trailerKey) {
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
  }, [expanded, clearDelay, slotId, trailerKey]);

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

  const tileW = expanded ? Math.round((tileH * 16) / 9) : Math.round((tileH * 2) / 3);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const onFocusIn = () => {
      if (!isBrowseKeyboardFocus() && !isTVPlatform()) {
        setRemoteFocused(false);
        return;
      }
      setRemoteFocused(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && slot.contains(next)) return;
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

  const progressPct = (() => {
    if (typeof progress !== 'number') return 0;
    if (!downloading && progress <= 0) return 0;
    // Téléchargements / ContentItem : déjà en 0–100. Fraction 0–1 seulement en legacy lecture.
    const p = downloading || progress > 1 ? progress : progress * 100;
    return Math.min(100, Math.max(0, p));
  })();
  const showProgressBar = downloading || progressPct > 0;

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
      data-preview-expanded={expanded ? 'true' : 'false'}
      data-tv-item-key={contentItemKey(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <FocusableCard
        className={[
          'block w-full outline-none relative overflow-hidden rounded-md bg-[#141414] transition-[transform,box-shadow,filter] duration-150 ease-out',
          expanded
            ? ''
            : hovered
              ? 'z-[2] scale-[1.04] shadow-[0_12px_28px_rgba(0,0,0,0.45)] brightness-110'
              : 'shadow-none',
        ].join(' ')}
        style={{ width: '100%', height: tileH }}
        ariaLabel={title}
        noScale
        asTorrentCard
        onClick={() => onNavigate(item)}
      >
        <div className="absolute inset-0" aria-hidden>
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />

          {playTrailer && expanded && trailerKey ? (
            <div
              className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-300 ${
                trailerReady ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <YouTubeVideoPlayer
                youtubeKey={trailerKey}
                autoplay
                muted
                loop
                controls={false}
                cover
                className="!absolute inset-0 !h-full !w-full !aspect-auto"
                onReady={() => setTrailerReady(true)}
              />
            </div>
          ) : null}

          {showProgressBar ? (
            <div
              className={`absolute inset-x-0 bottom-0 ${downloading ? 'h-1.5 bg-black/55' : 'h-[3px] bg-white/25'}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressPct)}
            >
              <div
                className={`h-full transition-[width] duration-500 ease-out ${
                  downloading
                    ? 'bg-[var(--ds-accent-violet,#a855f7)] shadow-[0_0_10px_rgba(168,85,247,0.45)]'
                    : 'bg-[var(--ds-accent-violet,#a855f7)]'
                }`}
                style={{ width: `${Math.max(progressPct, downloading && progressPct === 0 ? 2 : 0)}%` }}
              />
            </div>
          ) : null}
        </div>
      </FocusableCard>

      <div className="mt-2 sm:mt-2.5 tv:mt-3 px-0.5" style={{ width: '100%', minHeight: '2.75rem' }}>
        {expanded ? (
          <>
            <p className="truncate text-sm sm:text-base tv:text-xl font-semibold text-white">
              {metaLine || title}
            </p>
            {metaSubLine ? (
              <p className="mt-0.5 truncate text-xs sm:text-sm tv:text-base text-white/60">{metaSubLine}</p>
            ) : item.rating != null ? (
              <p className="mt-0.5 text-xs sm:text-sm tv:text-base text-white/60">★ {item.rating.toFixed(1)}</p>
            ) : null}
          </>
        ) : hovered ? (
          <>
            <p className="truncate text-sm font-medium text-white/90 transition-opacity duration-150">
              {metaLine || title}
            </p>
            {metaSubLine ? (
              <p className="mt-0.5 truncate text-xs text-white/55">{metaSubLine}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
