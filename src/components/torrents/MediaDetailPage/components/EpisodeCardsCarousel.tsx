import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, CircleCheck, Play, Download, CloudDownload, HardDrive, RefreshCw } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { PlaybackStatusSurface } from '../../../streaming/player-shared/components/PlaybackStatusSurface';
import { DsLoader } from '../../../ui/DsLoader';
import { computeReliableProgressPercent } from '../../../streaming/player-shared/derivePlaybackPhase';
import { useI18n } from '../../../../lib/i18n/useI18n';

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
  /** Stats torrent de l’épisode (affichées seulement si > 0). */
  seedCount?: number;
  leechCount?: number;
  /** Position de lecture sauvegardée — effet « reprendre » sur la carte. */
  canResume?: boolean;
  /** % de lecture de l'épisode (barre de reprise). */
  resumePercent?: number;
  isSelected: boolean;
  onSelect: () => void;
  isTV?: boolean;
  /** Action secondaire sur la carte (ex. « Retélécharger / autre release », admin). */
  secondaryAction?: {
    label: string;
    title?: string;
    busy?: boolean;
    onActivate: () => void;
  };
}

export function EpisodeCardsCarousel({
  items,
  ariaLabel,
}: {
  items: EpisodeCarouselItem[];
  ariaLabel: string;
}) {
  const { t } = useI18n();
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

  const isTV = isTVPlatform();
  const showArrows = !isTV;

  return (
    <div aria-label={ariaLabel} className="relative w-full min-w-0 max-w-full overflow-x-hidden overflow-y-visible py-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/60 to-transparent z-[1]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/60 to-transparent z-[1]" />

      {showArrows && (
        <>
          <button
            type="button"
            className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90 transition-[opacity,transform,background-color] duration-200 active:scale-95"
            onClick={() => scrollByCards(-1)}
            aria-label="Précédent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full border border-white/15 bg-black/40 hover:bg-black/60 text-white/90 transition-[opacity,transform,background-color] duration-200 active:scale-95"
            onClick={() => scrollByCards(1)}
            aria-label="Suivant"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      <div
        ref={scrollerRef}
        role="list"
        data-carousel
        data-tv-episode-scroller
        className="w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide px-4 sm:px-5 py-4 sm:py-5"
        style={{ scrollSnapType: 'x mandatory', touchAction: 'pan-x pan-y' }}
      >
        <div className="flex gap-4">
          {items.map((it) => {
            const interactive =
              it.isAvailable || it.isDownloaded || it.isDownloading || it.isSelected;
            // Play si téléchargé ; Download si dispo non local ; rien si indispo / downloading
            const showPlay = !it.isDownloading && !!it.isDownloaded;
            const showDownloadHint =
              !it.isDownloading && !it.isDownloaded && !!it.isAvailable;

            return (
              <button
                key={it.key}
                type="button"
                role="listitem"
                onClick={it.onSelect}
                data-focusable={it.isTV ? true : undefined}
                data-episode-card={it.key}
                tabIndex={0}
                aria-disabled={!interactive}
                title={interactive ? undefined : 'Aucune source pour cet épisode'}
                className={`ed-ep-card group text-left rounded-2xl border transition-[opacity,transform,border-color,background-color,box-shadow] duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--ed-accent,#f2545b)] focus:ring-offset-2 focus:ring-offset-black/40 shrink-0 w-[280px] sm:w-[320px] cursor-pointer ${
                  it.isSelected
                    ? 'is-selected border-[var(--ed-accent,#f2545b)]/65 bg-[var(--ed-accent,#f2545b)]/12 ring-1 ring-[var(--ed-accent,#f2545b)]/30'
                    : it.canResume
                    ? 'is-resume border-white/20 bg-white/[0.06]'
                    : it.isSelected
                      ? 'is-selected border-[var(--ed-accent,#f2545b)]/65 bg-[var(--ed-accent,#f2545b)]/12 ring-1 ring-[var(--ed-accent,#f2545b)]/30'
                      : interactive
                        ? 'border-white/10 bg-white/5 hover:bg-white/10'
                        : 'is-unavailable border-white/5 bg-white/[0.03] opacity-55 hover:opacity-80'
                }`}
                style={{ scrollSnapAlign: 'start' }}
                aria-current={it.isSelected ? 'true' : undefined}
                aria-label={it.canResume ? `${it.title} — ${t('playback.resumeLabel')}` : undefined}
                onFocus={(e) => {
                  (e.currentTarget as HTMLElement).scrollIntoView?.({
                    block: 'nearest',
                    inline: 'center',
                  });
                }}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black/30 rounded-t-2xl">
                  {it.thumbnailUrl ? (
                    <img
                      src={it.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-black/40 to-black/80" />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                  {it.isDownloading && (
                    <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 gap-3">
                        <DsLoader size="md" withLogo={false}>
                          <CloudDownload className="w-6 h-6 text-[var(--ed-accent,#f2545b)]" />
                        </DsLoader>
                        <PlaybackStatusSurface
                          variant="chip"
                          playStatus="downloading"
                          torrentStats={{
                            state: 'downloading',
                            progress:
                              typeof it.downloadProgress === 'number'
                                ? Math.min(1, Math.max(0, it.downloadProgress / 100))
                                : 0,
                          }}
                          progressMessage={it.statusMessage}
                          isActiveSession
                        />
                        {it.statusMessage ? (
                          <div className="text-[10px] text-white/55 truncate max-w-[200px] text-center">
                            {it.statusMessage}
                          </div>
                        ) : null}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                        <div
                          className="h-full bg-[var(--ed-accent,#f2545b)] transition-[width] duration-500 ease-out"
                          style={{
                            width: `${
                              computeReliableProgressPercent({
                                progress:
                                  typeof it.downloadProgress === 'number'
                                    ? it.downloadProgress / 100
                                    : 0,
                              }) ?? it.downloadProgress ?? 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="ed-ep-card__badges absolute left-3 top-3 flex items-center gap-2 z-10">
                    <span className="ed-ep-card__ep">
                      {typeof it.episodeNumber === 'number'
                        ? `ÉPISODE ${it.episodeNumber}`
                        : `${it.episodeNumber}`}
                    </span>
                    {!it.isDownloading && it.watched ? (
                      <span
                        title={t('playback.episodeWatched')}
                        aria-label={t('playback.episodeWatched')}
                        data-episode-watched
                        className="ed-ep-card__watched inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/55 border border-[var(--ed-accent,#f2545b)]/70"
                      >
                        <CircleCheck className="w-4 h-4 text-[var(--ed-accent,#f2545b)]" strokeWidth={1.75} />
                      </span>
                    ) : null}
                    {!it.isDownloading && it.isDownloaded ? (
                      <span
                        className="inline-flex items-center justify-center p-1.5 rounded-full bg-black/55 border border-white/25"
                        title="Téléchargé"
                        aria-label="Téléchargé"
                      >
                        <HardDrive className="w-4 h-4 text-white" strokeWidth={1.75} />
                      </span>
                    ) : !it.isDownloading && it.isAvailable ? (
                      <span
                        className="inline-flex items-center justify-center p-1.5 rounded-full bg-black/55 border border-white/25"
                        title="Disponible (Indexer)"
                        aria-label="Disponible"
                      >
                        <CloudDownload className="w-4 h-4 text-white/85" strokeWidth={1.75} />
                      </span>
                    ) : null}
                  </div>

                  {(showPlay || showDownloadHint) && (
                    <div
                      className={`ed-ep-card__action absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center border transition-[opacity,transform,background-color] duration-200 ${
                        it.canResume
                          ? 'border-[var(--ed-accent,#f2545b)]/50 bg-[var(--ed-accent,#f2545b)]/85 text-white'
                          : it.isSelected
                            ? 'border-[var(--ed-accent,#f2545b)]/50 bg-[var(--ed-accent,#f2545b)]/80 text-white'
                            : 'border-white/15 bg-black/40 text-white/90 group-hover:bg-[var(--ed-accent,#f2545b)]/80 group-hover:border-[var(--ed-accent,#f2545b)]/40'
                      }`}
                    >
                      {showPlay ? (
                        <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                    </div>
                  )}

                  {it.canResume && !it.isDownloading ? (
                    <>
                      <div className="absolute left-3 bottom-3 z-10">
                        <span className="ed-ep-card__resume inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-[0.2em] bg-black/60 text-white/90 border border-white/20">
                          {t('playback.resumeLabel')}
                          {typeof it.resumePercent === 'number' ? ` · ${it.resumePercent}%` : ''}
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15 z-10" data-episode-resume-bar>
                        <div
                          className="h-full bg-[var(--ed-accent,#f2545b)]"
                          style={{ width: `${typeof it.resumePercent === 'number' ? Math.max(3, Math.min(100, it.resumePercent)) : 40}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="ed-ep-card__body p-3 sm:p-4">
                  <div className="ed-ep-card__title text-base font-semibold text-white truncate">{it.title}</div>
                  {it.subtitle ? (
                    <div className="ed-ep-card__subtitle text-xs sm:text-sm text-white/60 line-clamp-2 mt-1">
                      {it.subtitle}
                    </div>
                  ) : null}
                  {typeof it.seedCount === 'number' || typeof it.leechCount === 'number' ? (
                    <div className="ed-ep-card__meta flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] sm:text-xs text-white/55">
                      {typeof it.seedCount === 'number' ? (
                        <span
                          className={
                            it.seedCount >= 10
                              ? 'text-emerald-400/90'
                              : it.seedCount >= 1
                                ? 'text-amber-400/90'
                                : 'text-white/45'
                          }
                        >
                          <span className="font-semibold tabular-nums">{it.seedCount}</span>{' '}
                          {t('mediaDetail.seedersShort')}
                        </span>
                      ) : null}
                      {typeof it.leechCount === 'number' ? (
                        <span>
                          <span className="font-semibold tabular-nums text-yellow-400/80">{it.leechCount}</span>{' '}
                          {t('mediaDetail.leechersShort')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {it.secondaryAction ? (
                    // span[role=button] : la carte est déjà un <button> (pas de bouton imbriqué).
                    <span
                      role="button"
                      tabIndex={0}
                      data-focusable={it.isTV ? true : undefined}
                      data-episode-secondary-action
                      aria-disabled={it.secondaryAction.busy ? 'true' : undefined}
                      title={it.secondaryAction.title ?? it.secondaryAction.label}
                      className={`ed-ep-card__secondary mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/15 bg-black/40 text-[11px] text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--ed-accent,#f2545b)] ${
                        it.secondaryAction.busy ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!it.secondaryAction?.busy) it.secondaryAction?.onActivate();
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (!it.secondaryAction?.busy) it.secondaryAction?.onActivate();
                      }}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${it.secondaryAction.busy ? 'animate-spin' : ''}`}
                        strokeWidth={1.75}
                      />
                      {it.secondaryAction.label}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
