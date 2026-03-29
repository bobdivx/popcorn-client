import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { SeriesEpisodesSection } from './SeriesEpisodesSection';
import { PackEpisodesSection } from './PackEpisodesSection';
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';
import type { PackEpisodeKey, PackEpisodesModel } from '../hooks/usePackEpisodes';
import { getWatchedEpisodesSet } from '../../../../lib/streaming/torrent-storage';

function EpisodeCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="px-4 sm:px-5 py-4 sm:py-5">
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="shrink-0 w-[280px] sm:w-[320px] rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden"
            aria-hidden
          >
            <div className="aspect-video w-full bg-white/[0.06] animate-pulse" />
            <div className="p-3 sm:p-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-white/[0.08] animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-white/[0.06] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EpisodesArea(props: {
  seriesEpisodes?: SeriesEpisodesResponse;
  tmdbId?: number | null;
  /** Incrémenté pour relire les épisodes « vus » depuis localStorage */
  watchedEpisodesRefresh?: number;
  selectedEpisodeVariantId: string | null;
  /** Sélection d’un épisode (saison + id) — le parent gère saison et lecture au clic. */
  onSelectEpisode: (episodeVariantId: string) => void;
  savedPlaybackPosition: number | null;
  episodesInLibraryCount?: number;

  isPackSelected: boolean;
  videoFilesCount: number;
  hasInfoHash: boolean;
  packInfoHash?: string | null;
  loadingPackPreview: boolean;
  /** Erreur list-files / .torrent (affichée pour expliquer l’absence d’épisodes pack) */
  packPreviewLoadError?: string | null;
  packPreviewFilesCount: number;

  packEpisodesModel: PackEpisodesModel | null;
  selectedPackSeason: number | null;
  onSelectPackSeason: (s: number) => void;
  selectedPackEpisodeKey: PackEpisodeKey | null;
  onSelectPackEpisodeKey: (key: PackEpisodeKey) => void;

  isTV?: boolean;
}) {
  const { t } = useI18n();
  const {
    seriesEpisodes,
    tmdbId,
    watchedEpisodesRefresh,
    selectedEpisodeVariantId,
    onSelectEpisode,
    savedPlaybackPosition,
    episodesInLibraryCount,
    isPackSelected,
    videoFilesCount,
    hasInfoHash,
    packInfoHash,
    loadingPackPreview,
    packPreviewLoadError,
    packPreviewFilesCount,
    packEpisodesModel,
    selectedPackSeason,
    onSelectPackSeason,
    selectedPackEpisodeKey,
    onSelectPackEpisodeKey,
    isTV,
  } = props;

  const [watchedTick, setWatchedTick] = useState(0);
  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent<{ tmdbId?: number }>).detail;
      if (d?.tmdbId != null && tmdbId != null && d.tmdbId === tmdbId) setWatchedTick((x) => x + 1);
    };
    window.addEventListener('popcorn-watched-episodes-changed', fn as EventListener);
    return () => window.removeEventListener('popcorn-watched-episodes-changed', fn as EventListener);
  }, [tmdbId]);

  const watchedSet = useMemo(() => {
    if (typeof tmdbId !== 'number') return new Set<string>();
    void watchedEpisodesRefresh;
    void watchedTick;
    return getWatchedEpisodesSet(tmdbId);
  }, [tmdbId, watchedEpisodesRefresh, watchedTick]);

  if (!seriesEpisodes?.seasons?.length) return null;

  const isOnlyFullPackPlaceholder =
    seriesEpisodes.seasons.length === 1 &&
    (seriesEpisodes.seasons[0]?.episodes?.length ?? 0) === 1 &&
    seriesEpisodes.seasons[0]?.episodes?.[0]?.episode === 0;

  return (
    <div className="mb-6 space-y-6">
      {isPackSelected && packPreviewLoadError ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-50/95 space-y-2"
        >
          <p className="font-medium">{packPreviewLoadError}</p>
          <p className="text-amber-100/80 text-xs leading-relaxed">{t('mediaDetail.packListFilesFailedIndexerHint')}</p>
        </div>
      ) : null}
      {!isOnlyFullPackPlaceholder ? (
        <SeriesEpisodesSection
          seriesEpisodes={seriesEpisodes}
          tmdbId={tmdbId}
          selectedEpisodeVariantId={selectedEpisodeVariantId}
          onSelectEpisode={onSelectEpisode}
          savedPlaybackPosition={savedPlaybackPosition}
          episodesInLibraryCount={episodesInLibraryCount}
          watchedSet={watchedSet}
          isTV={isTV}
        />
      ) : null}

      {isPackSelected && videoFilesCount <= 1 && !hasInfoHash && !loadingPackPreview && packPreviewFilesCount <= 1 && (
        <p className="text-xs text-white/60">{t('mediaDetail.packAddTorrentHint')}</p>
      )}
      {isPackSelected && loadingPackPreview && (
        <div className="rounded-xl overflow-hidden bg-black/35 border border-white/10">
          <EpisodeCardsSkeleton />
        </div>
      )}

      {isPackSelected && (videoFilesCount > 1 || packPreviewFilesCount > 1) ? (
        <div>
          {packEpisodesModel ? (
            <PackEpisodesSection
              model={packEpisodesModel}
              tmdbId={tmdbId}
              selectedSeason={selectedPackSeason}
              onSelectSeason={onSelectPackSeason}
              selectedEpisodeKey={selectedPackEpisodeKey}
              onSelectEpisodeKey={onSelectPackEpisodeKey}
              infoHash={packInfoHash}
              watchedSet={watchedSet}
              isTV={isTV}
            />
          ) : (
            <div className="rounded-xl overflow-hidden bg-black/35 border border-white/10">
              <EpisodeCardsSkeleton />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

