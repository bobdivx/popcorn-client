import { Play } from 'lucide-preact';

export interface EpisodeCardItem {
  key: string;
  episodeNumber: number | string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  isSelected: boolean;
  onSelect: () => void;
  isTV?: boolean;
}

export function EpisodeCardsGrid({ items, ariaLabel }: { items: EpisodeCardItem[]; ariaLabel: string }) {
  return (
    <div aria-label={ariaLabel} role="list" className="p-4 sm:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="listitem"
            onClick={it.onSelect}
            data-focusable={it.isTV ? true : undefined}
            tabIndex={0}
            className={`group text-left rounded-2xl overflow-hidden border transition focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              it.isSelected ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
            aria-current={it.isSelected ? 'true' : undefined}
          >
            <div className="relative aspect-video w-full overflow-hidden bg-black/30">
              {it.thumbnailUrl ? (
                <img src={it.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/40 to-black/80" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90">
                  {typeof it.episodeNumber === 'number' ? `ÉPISODE ${it.episodeNumber}` : `${it.episodeNumber}`}
                </span>
              </div>

              <div className="absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-black/40 text-white/90 group-hover:bg-primary-500/80 group-hover:border-primary-500/40 transition">
                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
              </div>
            </div>

            <div className="p-3 sm:p-4">
              <div className="text-base font-semibold text-white truncate">{it.title}</div>
              {it.subtitle ? <div className="text-xs sm:text-sm text-white/60 line-clamp-2 mt-1">{it.subtitle}</div> : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

