import { useEffect, useRef, useState } from 'preact/hooks';
import type { ContentItem } from '../../lib/client/types';
import { getDisplayTitle } from '../../lib/utils/title-display';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { FocusableCard } from '../ui/FocusableCard';
import { contentItemKey } from '../dashboard/utils/browsePriority';
import { reanchorBrowseSlot } from './browseCarouselAnchor';
import {
  ensureBrowseInputModalityTracking,
  isBrowseKeyboardFocus,
} from './browseInputModality';

export { reanchorBrowseSlot, ensureBrowseRowInView } from './browseCarouselAnchor';

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
  metaLine?: string | null;
  metaSubLine?: string | null;
}

/**
 * Tuile browse :
 * - souris : portrait + léger hover
 * - flèches / télécommande : paysage ancré à gauche (pas de bande-annonce)
 */
export function TitlePreviewCard({
  item,
  onNavigate,
  progress,
  metaLine,
  metaSubLine,
}: TitlePreviewCardProps) {
  const tileH = useTileHeight();
  const slotRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  /** Expand paysage : uniquement après focus clavier / télécommande. */
  const [remoteFocused, setRemoteFocused] = useState(false);

  const poster = item.poster || item.backdrop;
  const backdrop = item.backdrop || item.poster;
  const title = getDisplayTitle(item);
  const expanded = remoteFocused;

  useEffect(() => {
    ensureBrowseInputModalityTracking();
  }, []);

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

  if (!poster && !backdrop) return null;

  const progressPct = (() => {
    if (typeof progress !== 'number' || progress <= 0) return 0;
    const p = progress <= 1 ? progress * 100 : progress;
    return Math.min(100, Math.max(0, p));
  })();

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
            src={(expanded ? backdrop : poster) || poster || ''}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />

          {progressPct > 0 ? (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
              <div
                className="h-full bg-[var(--ds-accent-violet,#a855f7)]"
                style={{ width: `${progressPct}%` }}
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
          <p className="truncate text-sm font-medium text-white/90 transition-opacity duration-150">
            {metaLine || title}
          </p>
        ) : null}
      </div>
    </div>
  );
}
