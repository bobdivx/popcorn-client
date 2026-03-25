import { useEffect, useRef } from 'preact/hooks';
import { Play } from 'lucide-preact';

export interface EpisodeListItem {
  key: string;
  episodeNumber: number | string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  isSelected: boolean;
  onSelect: () => void;
}

export interface EpisodeListProps {
  ariaLabel: string;
  items: EpisodeListItem[];
  /** TV: activer les attributs focus + focus auto. */
  isTV?: boolean;
  /** TV: si true, on peut autofocus la liste quand elle change. */
  enableAutoFocus?: boolean;
}

export function EpisodeList({ ariaLabel, items, isTV, enableAutoFocus }: EpisodeListProps) {
  const rootRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!isTV || !enableAutoFocus) return;
    if (!rootRef.current) return;
    // Ne pas voler le focus si l'utilisateur est déjà dans un autre contrôle.
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest?.('[data-media-detail-action], [data-media-detail-back], [data-pack-episodes]')) {
      // Si le focus est déjà dans la zone episodes, on peut ajuster; sinon on laisse.
      const inThisList = active.closest?.('[data-episode-list]') === rootRef.current.closest?.('[data-episode-list]');
      if (!inThisList) return;
    }

    const t = setTimeout(() => {
      const scope = rootRef.current?.closest<HTMLElement>('[data-episode-list]');
      if (!scope) return;
      const selected = scope.querySelector<HTMLElement>('[data-episode-item][aria-current="true"]');
      const first = scope.querySelector<HTMLElement>('[data-episode-item]');
      (selected ?? first)?.focus?.();
    }, 40);
    return () => clearTimeout(t);
  }, [isTV, enableAutoFocus, items.length]);

  return (
    <ul
      ref={rootRef}
      className="p-2 sm:p-3 space-y-2 sm:space-y-3"
      role="list"
      aria-label={ariaLabel}
      data-episode-list
    >
      {items.map((it) => (
        <li key={it.key} className="rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={it.onSelect}
            data-focusable={isTV ? true : undefined}
            data-episode-item
            tabIndex={0}
            className={`w-full flex items-center gap-4 px-5 py-4 sm:py-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 group border ${
              it.isSelected
                ? 'bg-primary-600/30 text-white border-primary-500/40'
                : 'bg-white/5 hover:bg-white/10 text-white/90 border-white/10'
            }`}
            aria-current={it.isSelected ? 'true' : undefined}
          >
            {it.thumbnailUrl ? (
              <span className="flex-shrink-0 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/10">
                <img
                  src={it.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </span>
            ) : (
              <span
                className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-lg font-extrabold tabular-nums ${
                  it.isSelected ? 'bg-primary-500/30' : 'bg-white/10'
                }`}
                aria-hidden
              >
                {it.episodeNumber}
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block truncate text-base sm:text-lg font-semibold">{it.title}</span>
              {it.subtitle ? (
                <span className="block truncate text-xs sm:text-sm text-white/60">{it.subtitle}</span>
              ) : null}
            </span>
            <span
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                it.isSelected ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/80 group-hover:bg-primary-500/80'
              }`}
              aria-hidden
            >
              <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

