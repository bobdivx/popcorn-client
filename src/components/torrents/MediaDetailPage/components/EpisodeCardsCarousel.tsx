import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, CircleCheck, Play, CloudDownload, HardDrive } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

export interface EpisodeCarouselItem {
  key: string;
  episodeNumber: number | string;
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  /** Épisode marqué comme vu (lecture quasi complète ou fin). */
  watched?: boolean;
  /** Disponible dans un indexeur (torrent trouvé). */
  isAvailable?: boolean;
  /** Déjà téléchargé (fichier local présent). */
  isDownloaded?: boolean;
  /** En cours de téléchargement (via le client). */
  isDownloading?: boolean;
  /** Progression du téléchargement (0 à 100). */
  downloadProgress?: number;
  /** Message de statut (ex: "Initialisation...") */
  statusMessage?: string | null;
  isSelected: boolean;
  onSelect: () => void;
  isTV?: boolean;
}

export function EpisodeCardsCarousel({
  items,
  ariaLabel,
}: {
  items: EpisodeCarouselItem[];
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const selectedKey = useMemo(() => items.find((i) => i.isSelected)?.key ?? null, [items]);

  useEffect(() => {
    if (!selectedKey) return;
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-episode-card="${CSS.escape(selectedKey)}"]`);
    el?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: isTVPlatform() ? 'auto' : 'smooth',
    });
  }, [selectedKey]);

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-episode-card]');
    const cardWidth = card ? card.getBoundingClientRect().width : 320;
    el.scrollBy({
      left: dir * (cardWidth + 16) * 2,
      behavior: isTVPlatform() ? 'auto' : 'smooth',
    });
  };

  return (
    <div aria-label={ariaLabel} className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/60 to-transparent" />

      <button
        type="button"
        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90"
        onClick={() => scrollByCards(-1)}
        aria-label="Précédent"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90"
        onClick={() => scrollByCards(1)}
        aria-label="Suivant"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div
        ref={scrollerRef}
        role="list"
        className="overflow-x-auto scrollbar-hide px-4 sm:px-5 py-4 sm:py-5"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex gap-4">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="listitem"
              onClick={it.onSelect}
              data-focusable={it.isTV ? true : undefined}
              data-episode-card={it.key}
              tabIndex={0}
              className={`group text-left rounded-2xl overflow-hidden border transition focus:outline-none focus:ring-2 focus:ring-primary-500 shrink-0 w-[280px] sm:w-[320px] ${
                it.isSelected ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              style={{ scrollSnapAlign: 'start' }}
              aria-current={it.isSelected ? 'true' : undefined}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'center' });
              }}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black/30">
                {it.thumbnailUrl ? (
                  <img
                    src={it.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/40 to-black/80" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                {/* Overlay Premium de Téléchargement */}
                {it.isDownloading && (
                  <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                    {/* Gradient de fond demandé */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/90 to-black transition-opacity duration-500" />
                    
                    {/* Contenu de l'overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                      {/* Anneau de progression ou icône pulsante */}
                      <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-3">
                        <div className="absolute inset-0 rounded-full border-2 border-white/5" />
                        <div 
                          className="absolute inset-0 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" 
                          style={{ 
                            animationDuration: '1s',
                            maskImage: `conic-gradient(transparent 20%, black 100%)`
                          }} 
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <CloudDownload className="w-6 h-6 sm:w-7 sm:h-7 text-primary-400 animate-pulse" />
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-[10px] sm:text-xs font-bold text-white tracking-[0.2em] uppercase mb-1 drop-shadow-md opacity-80">
                          En cours
                        </div>
                        {typeof it.downloadProgress === 'number' && (
                          <div className="text-xl sm:text-2xl font-black text-white drop-shadow-lg tabular-nums">
                            {Math.round(it.downloadProgress)}%
                          </div>
                        )}
                        {it.statusMessage && (
                          <div className="text-[9px] sm:text-[10px] text-white/50 uppercase tracking-tighter mt-1 truncate max-w-[180px]">
                            {it.statusMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lueur d'activité en bas */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                      <div 
                        className="h-full bg-primary-500 transition-all duration-500 shadow-[0_0_12px_rgba(var(--color-primary-500,168,85,247),0.6)]"
                        style={{ width: `${it.downloadProgress ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90">
                    {typeof it.episodeNumber === 'number' ? `ÉPISODE ${it.episodeNumber}` : `${it.episodeNumber}`}
                  </span>
                  {it.watched ? (
                    <span
                      className="inline-flex items-center justify-center"
                      title="Déjà vu"
                      aria-label="Déjà vu"
                    >
                      <CircleCheck className="w-6 h-6 text-emerald-400 drop-shadow-md" strokeWidth={2.5} />
                    </span>
                  ) : null}

                  {/* Icones de statut (Téléchargé > Disponible) */}
                  {it.isDownloaded ? (
                    <span
                      className="inline-flex items-center justify-center p-1.5 rounded-full bg-blue-500/80 border border-blue-400/50 shadow-lg"
                      title="Téléchargé"
                      aria-label="Téléchargé"
                    >
                      <HardDrive className="w-4 h-4 text-white" strokeWidth={2.5} />
                    </span>
                  ) : it.isAvailable ? (
                    <span
                      className="inline-flex items-center justify-center p-1.5 rounded-full bg-amber-500/80 border border-amber-400/50 shadow-lg"
                      title="Disponible (Indexer)"
                      aria-label="Disponible"
                    >
                      <CloudDownload className="w-4 h-4 text-white" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </div>

                <div className="absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-black/40 text-white/90 group-hover:bg-primary-500/80 group-hover:border-primary-500/40 transition">
                  <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                </div>
              </div>

              <div className="p-3 sm:p-4">
                <div className="text-base font-semibold text-white truncate">{it.title}</div>
                {it.subtitle ? (
                  <div className="text-xs sm:text-sm text-white/60 line-clamp-2 mt-1">{it.subtitle}</div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

