import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { SeriesEpisodesSection } from './SeriesEpisodesSection';
import { PackEpisodesSection } from './PackEpisodesSection';
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';
import type { PackEpisodeKey, PackEpisodesModel } from '../hooks/usePackEpisodes';
import { getWatchedEpisodesSet } from '../../../../lib/streaming/torrent-storage';

export function EpisodesArea(props: {
  seriesEpisodes?: SeriesEpisodesResponse;
  tmdbId?: number | null;
  /** Incrémenté pour relire les épisodes « vus » depuis localStorage */
  watchedEpisodesRefresh?: number;
  selectedSeasonNum: number | null;
  selectedEpisodeVariantId: string | null;
  onSelectSeason: (seasonNum: number) => void;
  onSelectEpisode: (episodeVariantId: string) => void;
  savedPlaybackPosition: number | null;
  episodesInLibraryCount?: number;

  isPackSelected: boolean;
  videoFilesCount: number;
  hasInfoHash: boolean;
  packInfoHash?: string | null;
  loadingPackPreview: boolean;
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
    onSelectSeason,
    onSelectEpisode,
    savedPlaybackPosition,
    episodesInLibraryCount,
    isPackSelected,
    videoFilesCount,
    hasInfoHash,
    packInfoHash,
    loadingPackPreview,
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
      {!isOnlyFullPackPlaceholder ? (
        <SeriesEpisodesSection
          seriesEpisodes={seriesEpisodes}
          tmdbId={tmdbId}
          selectedEpisodeVariantId={selectedEpisodeVariantId}
          onSelectEpisode={(id) => {
            const se = seriesEpisodes.seasons.find((s) => s.episodes.some((e) => e.id === id));
            if (se) onSelectSeason(se.season);
            onSelectEpisode(id);
          }}
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
        <p className="text-xs text-white/60">{t('common.loading') || 'Chargement...'}</p>
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
            <div className="p-4 text-xs text-white/60 rounded-xl bg-black/40 border border-white/10">
              {t('common.loading') || 'Chargement...'}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

