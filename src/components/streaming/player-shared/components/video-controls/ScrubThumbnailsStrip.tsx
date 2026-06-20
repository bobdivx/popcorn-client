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

export function ScrubThumbnailsStrip({
  scrubEnabled,
  scrubThumbnailsLoading,
  scrubThumbnails,
  showControls,
  isTV,
  isFullscreen,
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
  if (!showControls) return null;

  // Squelette uniquement au tout premier chargement (aucune meta encore). Ne pas l’afficher
  // pendant une régén en arrière-plan : sinon « ombres » qui remplacent un carrousel déjà bon.
  const showInitialSkeleton = scrubThumbnailsLoading && !scrubThumbnails;
  if (showInitialSkeleton) {
    return (
      <div
        class="relative z-10 flex w-full max-w-full flex-nowrap justify-center gap-2 sm:gap-3 box-border overflow-hidden pb-1 min-h-0"
        aria-hidden
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            class="relative flex-1 min-w-0 basis-0 max-w-[8.5rem] aspect-video rounded-xl overflow-hidden shadow-lg"
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
  const windowSize = scrubWindowSize(count, isTV, isFullscreen);
  const showCarouselNav = !isTV && count > windowSize;
  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex < count - 1;
  const { start, end } = scrubVisibleWindow(count, selectedIndex, isTV, isFullscreen);

  const navButtonClass = (enabled: boolean) =>
    `flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border transition-all ${
      enabled
        ? 'bg-white/10 border-white/25 text-white hover:bg-white/20 hover:border-white/40 cursor-pointer'
        : 'bg-white/5 border-white/10 text-white/25 cursor-default pointer-events-none'
    }`;

  const items = [];
  for (let idx = start; idx <= end; idx++) {
    const selected = idx === selectedIndex;
    const thumbTime = timeForScrubIndex(idx);
    items.push(
      <button
        key={idx}
        type="button"
        tabIndex={-1}
        class={`relative rounded-xl overflow-hidden bg-black/70 border flex-1 min-w-0 basis-0 max-w-[8.5rem] aspect-video ${
          selected
            ? isTV && tvScrubFocused
              ? 'border-white ring-4 ring-white/95'
              : 'border-white ring-2 ring-white/90'
            : 'border-white/20'
        } shadow-lg focus:outline-none focus:ring-2 focus:ring-white/80 transition-all ${
          isTV ? 'cursor-default pointer-events-none' : 'cursor-pointer hover:border-white/50'
        }`}
        onClick={(e: Event) => {
          if (isTV) return;
          e.preventDefault();
          e.stopPropagation();
          seekToThumbnail(idx);
        }}
        aria-label={seekToPositionLabel(formatTime(thumbTime))}
        aria-current={selected ? 'true' : undefined}
      >
        <ScrubThumbnailImage
          src={getScrubUrlForIndex(idx)}
          loading={selected ? 'eager' : 'lazy'}
          fetchPriority={selected ? 'high' : 'low'}
          retryWhileLoading={scrubThumbnailsLoading}
        />
      </button>
    );
  }

  return (
    <div
      class={`relative z-10 flex w-full max-w-full items-center gap-1 sm:gap-2 box-border pb-1 min-h-0 transition-opacity ${
        scrubThumbnailsLoading ? 'opacity-80' : 'opacity-100'
      }`}
      aria-hidden
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
      <div class="flex flex-1 min-w-0 flex-nowrap justify-center gap-2 sm:gap-3 overflow-hidden">
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
    </div>
  );
}
