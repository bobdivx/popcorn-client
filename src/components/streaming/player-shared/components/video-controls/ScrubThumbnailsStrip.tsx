import type { ScrubThumbnailsMeta } from '../../types/scrubThumbnails';
import { formatTime } from '../../utils/formatTime';
import { scrubVisibleWindow } from './scrubMath';

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
  seekToPositionLabel: (time: string) => string;
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
  seekToPositionLabel,
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
            class="flex-1 min-w-0 basis-0 max-w-[8.5rem] aspect-video rounded-xl bg-white/10 animate-pulse shadow-lg"
          />
        ))}
      </div>
    );
  }

  if (!scrubEnabled || !scrubThumbnails) return null;

  const count = scrubThumbnails.count;
  const selectedIndex = Math.min(count - 1, Math.max(0, tvScrubIndex));
  const { start, end } = scrubVisibleWindow(count, selectedIndex, isTV, isFullscreen);

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
      >
        <img
          src={getScrubUrlForIndex(idx)}
          alt=""
          class="absolute inset-0 w-full h-full object-cover pointer-events-none"
          loading={selected ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={selected ? 'high' : 'low'}
        />
      </button>
    );
  }

  return (
    <div
      class={`relative z-10 flex w-full max-w-full flex-nowrap justify-center gap-2 sm:gap-3 box-border overflow-hidden pb-1 min-h-0 transition-opacity ${
        scrubThumbnailsLoading ? 'opacity-80' : 'opacity-100'
      }`}
      aria-hidden
    >
      {items}
    </div>
  );
}
