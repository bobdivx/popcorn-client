import { useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import type { ScrubThumbnailsMeta } from '../../types/scrubThumbnails';
import { formatTime } from '../../utils/formatTime';
import { ScrubThumbnailImage, ScrubThumbnailSkeleton } from './ScrubThumbnailImage';
import { scrubVisibleWindow, scrubWindowSize } from './scrubMath';

interface ScrubThumbnailsStripProps {
  scrubEnabled: boolean;
  scrubThumbnailsLoading: boolean;
  scrubThumbnails: ScrubThumbnailsMeta | null;
  showControls: boolean;
  isTV: boolean;
  isFullscreen: boolean;
  isMobile?: boolean;
  tvScrubFocused: boolean;
  /** Index courant (desktop interne ou TV externe). */
  tvScrubIndex: number;
  getScrubUrlForIndex: (idx: number) => string;
  timeForScrubIndex: (idx: number) => number;
  seekToThumbnail: (idx: number) => void;
  stepScrubIndex: (delta: number) => void;
  seekToPositionLabel: (time: string) => string;
  previousThumbnailLabel: string;
  nextThumbnailLabel: string;
}

/** Seuil px pour avancer d'une vignette au swipe. */
const SWIPE_STEP_PX = 48;

export function ScrubThumbnailsStrip({
  scrubEnabled,
  scrubThumbnailsLoading,
  scrubThumbnails,
  showControls,
  isTV,
  isFullscreen,
  isMobile = false,
  tvScrubFocused,
  tvScrubIndex,
  getScrubUrlForIndex,
  timeForScrubIndex,
  seekToThumbnail,
  stepScrubIndex,
  seekToPositionLabel,
  previousThumbnailLabel,
  nextThumbnailLabel,
}: ScrubThumbnailsStripProps) {
  const swipeRef = useRef<{
    x: number;
    y: number;
    lastStepX: number;
    moved: boolean;
    axis: 'h' | 'v' | null;
  } | null>(null);
  const suppressClickUntilRef = useRef(0);

  if (!showControls) return null;

  const tileClass = isMobile
    ? 'relative rounded-lg overflow-hidden bg-black/70 border flex-none w-[22vw] max-w-[6.25rem] min-w-[4.75rem] aspect-video'
    : 'relative rounded-xl overflow-hidden bg-black/70 border flex-1 min-w-0 basis-0 max-w-[10.5rem] aspect-video';

  const showInitialSkeleton = scrubThumbnailsLoading && !scrubThumbnails;
  if (showInitialSkeleton) {
    const skeletonCount = isMobile ? 3 : 5;
    return (
      <div
        class={`relative z-10 flex w-full max-w-full flex-nowrap justify-center gap-2.5 sm:gap-3 box-border overflow-hidden pb-1 min-h-0 ${
          isMobile ? 'px-1' : ''
        }`}
        aria-hidden
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            class={`${tileClass} border-white/10 shadow-lg`}
          >
            <ScrubThumbnailSkeleton />
          </div>
        ))}
      </div>
    );
  }

  if (!scrubEnabled || !scrubThumbnails) return null;

  const count = scrubThumbnails.count;
  const selectedIndex = Math.min(count - 1, Math.max(0, tvScrubIndex));
  const windowSize = scrubWindowSize(count, isTV, isFullscreen, isMobile);
  // Mobile : swipe doigt, pas de flèches.
  const showCarouselNav = !isTV && !isMobile && count > windowSize;
  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < count - 1;
  const { start, end } = scrubVisibleWindow(count, selectedIndex, isTV, isFullscreen, isMobile);

  const navButtonClass = (enabled: boolean) =>
    `flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border transition-all ${
      enabled
        ? 'bg-white/10 border-white/25 text-white hover:bg-white/20 hover:border-white/40 cursor-pointer'
        : 'bg-white/5 border-white/10 text-white/25 cursor-default pointer-events-none'
    }`;

  const onPointerDown = (e: any) => {
    if (!isMobile || isTV) return;
    const t = e.touches?.[0] ?? e;
    swipeRef.current = {
      x: t.clientX,
      y: t.clientY,
      lastStepX: t.clientX,
      moved: false,
      axis: null,
    };
  };

  const onPointerMove = (e: any) => {
    if (!isMobile || isTV || !swipeRef.current) return;
    const t = e.touches?.[0] ?? e;
    const dx = t.clientX - swipeRef.current.x;
    const dy = t.clientY - swipeRef.current.y;
    if (swipeRef.current.axis == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      swipeRef.current.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (swipeRef.current.axis !== 'h') return;

    e.preventDefault?.();
    e.stopPropagation?.();
    swipeRef.current.moved = true;

    // Avance / recule en direct pendant le glissement.
    const stepDx = t.clientX - swipeRef.current.lastStepX;
    if (Math.abs(stepDx) >= SWIPE_STEP_PX) {
      const steps = Math.trunc(stepDx / SWIPE_STEP_PX);
      // Swipe gauche (dx négatif) → avancer ; droite → reculer.
      stepScrubIndex(-steps);
      swipeRef.current.lastStepX += steps * SWIPE_STEP_PX;
      suppressClickUntilRef.current = Date.now() + 450;
    }
  };

  const onPointerUp = () => {
    if (!isMobile || isTV || !swipeRef.current) return;
    if (swipeRef.current.moved) {
      suppressClickUntilRef.current = Date.now() + 450;
    }
    swipeRef.current = null;
  };

  const items = [];
  for (let idx = start; idx <= end; idx++) {
    const selected = idx === selectedIndex;
    const thumbTime = timeForScrubIndex(idx);
    items.push(
      <button
        key={idx}
        type="button"
        tabIndex={-1}
        class={`${tileClass} ${
          selected
            ? isTV && tvScrubFocused
              ? 'border-white ring-4 ring-white/95 scale-[1.04]'
              : 'border-white ring-2 ring-white/90 scale-[1.03]'
            : 'border-white/20'
        } shadow-lg focus:outline-none focus:ring-2 focus:ring-white/80 transition-transform cursor-pointer hover:border-white/50
        onClick={(e: Event) => {
          // Après un swipe, ignore le click fantôme.
          if (isMobile && Date.now() < suppressClickUntilRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          seekToThumbnail(idx);
        }}
        aria-label={seekToPositionLabel(formatTime(thumbTime))}
        aria-current={selected ? 'true' : undefined}
      >
        <ScrubThumbnailImage
          src={getScrubUrlForIndex(idx)}
          loading="eager"
          fetchPriority={selected ? 'high' : 'low'}
          retryWhileLoading={scrubThumbnailsLoading}
        />
        {selected && (
          <span class="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] sm:text-xs text-white font-medium tabular-nums">
            {formatTime(thumbTime)}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      class={`relative z-10 flex w-full max-w-full items-center gap-1.5 sm:gap-2 box-border pb-1 min-h-0 transition-opacity touch-pan-y select-none ${
        scrubThumbnailsLoading ? 'opacity-80' : 'opacity-100'
      }`}
      style={isMobile ? { touchAction: 'pan-y' } : undefined}
      aria-hidden
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      onTouchCancel={() => {
        swipeRef.current = null;
      }}
    >
      {showCarouselNav && (
        <button
          type="button"
          tabIndex={-1}
          class={navButtonClass(canGoPrev)}
          disabled={!canGoPrev}
          aria-label={previousThumbnailLabel}
          onClick={(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            if (canGoPrev) stepScrubIndex(-1);
          }}
        >
          <ChevronLeft class="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}
      <div
        class={`flex flex-1 min-w-0 flex-nowrap justify-center overflow-hidden ${
          isMobile ? 'gap-2.5 px-1' : 'gap-2 sm:gap-3'
        }`}
      >
        {items}
      </div>
      {showCarouselNav && (
        <button
          type="button"
          tabIndex={-1}
          class={navButtonClass(canGoNext)}
          disabled={!canGoNext}
          aria-label={nextThumbnailLabel}
          onClick={(e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            if (canGoNext) stepScrubIndex(1);
          }}
        >
          <ChevronRight class="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      )}
      {isMobile && (
        <span class="sr-only">Glissez horizontalement pour parcourir les miniatures</span>
      )}
    </div>
  );
}
