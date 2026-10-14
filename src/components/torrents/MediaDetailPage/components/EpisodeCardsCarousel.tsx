import { useEffect, useMemo, useRef } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Play, Download, CloudDownload } from 'lucide-preact';
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
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--ed-bg,#0c0d10)] to-transparent z-[1]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--ed-bg,#0c0d10)] to-transparent z-[1]" />

      {showArrows && (
        <>
          <button
            type="button"
            className="hidden lg:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center border border-[var(--ed-line-strong)] bg-black/50 text-white/90 transition-[opacity,transform,background-color] duration-200 active:scale-95"
            onClick={() => scrollByCards(-1)}
            aria-label="Précédent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="hidden lg:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center border border-[var(--ed-line-strong)] bg-black/50 text-white/90 transition-[opacity,transform,background-color] duration-200 active:scale-95"
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
        className="w-full min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hide px-2 sm:px-3 py-2 sm:py-3"
        style={{ scrollSnapType: 'x mandatory', touchAction: 'pan-x pan-y' }}
      >
        <div className="flex gap-3 sm:gap-4">
          {items.map((it) => {
            const interactive =
              it.isAvailable || it.isDownloaded || it.isDownloading || it.isSelected;
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
                className={[
                  'ed-episode-card group focus:outline-none',
                  it.canResume ? 'is-resume' : '',
                  it.isSelected ? 'is-selected' : '',
                  !interactive ? 'is-unavailable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
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
                <div className="ed-episode-card__media">
                  {it.thumbnailUrl ? (
                    <img src={it.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-black/40 to-black/80" />
                  )}
                  <div className="ed-episode-card__shade" />

                  {it.isDownloading && (
                    <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                      <div className="absolute inset-0 bg-black/55" />
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
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10">
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

                  <span className="ed-episode-card__badge">
                    {typeof it.episodeNumber === 'number'
                      ? `${t('mediaDetail.episodeShort') || 'Ép.'} ${it.episodeNumber}`
                      : `${it.episodeNumber}`}
                  </span>

                  {!it.isDownloading && (it.watched || it.isDownloaded || it.isAvailable) ? (
                    <div className="ed-episode-card__flags">
                      {it.watched ? (
                        <span className="ed-episode-card__flag">{t('mediaDetail.watchedShort') || 'Vu'}</span>
                      ) : null}
                      {it.isDownloaded ? (
                        <span className="ed-episode-card__flag ed-episode-card__flag--local">
                          {t('mediaDetail.localShort') || 'Local'}
                        </span>
                      ) : it.isAvailable ? (
                        <span className="ed-episode-card__flag">
                          {t('mediaDetail.availableShort') || 'Dispo'}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {(showPlay || showDownloadHint) && (
                    <span className="ed-episode-card__action" aria-hidden="true">
                      {showPlay ? (
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </span>
                  )}

                  {it.canResume && !it.isDownloading ? (
                    <div className="absolute left-3 bottom-3 z-10">
                      <span className="ed-episode-card__flag ed-episode-card__flag--local">
                        {t('playback.resumeLabel')}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="ed-episode-card__body">
                  <div className="ed-episode-card__title">{it.title}</div>
                  {it.subtitle ? (
                    <div className="text-xs text-white/55 line-clamp-2 mt-1">{it.subtitle}</div>
                  ) : null}
                  {typeof it.seedCount === 'number' || typeof it.leechCount === 'number' ? (
                    <div className="ed-episode-card__meta">
                      {typeof it.seedCount === 'number' ? (
                        <span className={it.seedCount >= 10 ? 'is-good' : undefined}>
                          {it.seedCount} {t('mediaDetail.seedersShort')}
                        </span>
                      ) : null}
                      {typeof it.leechCount === 'number' ? (
                        <span>
                          {it.leechCount} {t('mediaDetail.leechersShort')}
                        </span>
                      ) : null}
                    </div>
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
