import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';
import { serverApi } from '../../../../lib/client/server-api';
import { watchedEpisodeKey } from '../../../../lib/streaming/torrent-storage';
import { EpisodeCardsCarousel } from './EpisodeCardsCarousel';

export interface SeriesEpisodesSectionProps {
  seriesEpisodes: SeriesEpisodesResponse;
  tmdbId?: number | null;
  selectedEpisodeVariantId: string | null;
  onSelectEpisode: (episodeVariantId: string) => void;
  savedPlaybackPosition: number | null;
  /** Nombre d'épisodes en bibliothèque (série depuis library) */
  episodesInLibraryCount?: number;
  downloadedEpisodesSet?: Set<string>;
  watchedSet?: Set<string>;
  isTV?: boolean;
  /** Torrent info pour l'épisode sélectionné */
  isDownloading?: boolean;
  downloadProgress?: number;
  statusMessage?: string | null;
}

/**
 * Une ligne de cartes épisode par saison (sans menu déroulant) — type Netflix / grilles par saison.
 */
export function SeriesEpisodesSection({
  seriesEpisodes,
  tmdbId,
  selectedEpisodeVariantId,
  onSelectEpisode,
  savedPlaybackPosition,
  episodesInLibraryCount,
  downloadedEpisodesSet,
  watchedSet,
  isTV,
  isDownloading,
  downloadProgress,
  statusMessage,
}: SeriesEpisodesSectionProps) {
  const { t } = useI18n();
  const hasSavedPosition = savedPlaybackPosition != null && savedPlaybackPosition > 0;
  /** Clés : `${season}:${episodeNumber}` (TMDB par saison ; numéros d'épisode peuvent se répéter entre saisons). */
  const [tmdbStillBySeasonEpisode, setTmdbStillBySeasonEpisode] = useState<Record<string, string>>({});
  const [tmdbNameBySeasonEpisode, setTmdbNameBySeasonEpisode] = useState<Record<string, string>>({});

  const seasonListKey = useMemo(
    () => seriesEpisodes.seasons.map((s) => s.season).join(','),
    [seriesEpisodes.seasons],
  );

  useEffect(() => {
    let cancelled = false;
    if (typeof tmdbId !== 'number') {
      setTmdbStillBySeasonEpisode({});
      setTmdbNameBySeasonEpisode({});
      return;
    }
    const seasons = seriesEpisodes.seasons.map((s) => s.season);
    if (seasons.length === 0) {
      setTmdbStillBySeasonEpisode({});
      setTmdbNameBySeasonEpisode({});
      return;
    }
    (async () => {
      const merged: Record<string, string> = {};
      const names: Record<string, string> = {};
      await Promise.all(
        seasons.map(async (seasonNum) => {
          const res = await serverApi.getTmdbTvSeasonDetail(tmdbId, seasonNum, 'fr-FR');
          if (cancelled) return;
          if (!res?.success || !res.data) return;
          const episodes = Array.isArray(res.data.episodes) ? res.data.episodes : [];
          for (const ep of episodes) {
            const num = typeof ep?.episode_number === 'number' ? ep.episode_number : null;
            const stillPath = typeof ep?.still_path === 'string' ? ep.still_path : null;
            if (num && stillPath) {
              merged[`${seasonNum}:${num}`] = `https://image.tmdb.org/t/p/w780${stillPath}`;
            }
            if (num) {
              const episodeName = typeof ep?.name === 'string' ? ep.name.trim() : '';
              if (episodeName) names[`${seasonNum}:${num}`] = episodeName;
            }
          }
        }),
      );
      if (!cancelled) {
        setTmdbStillBySeasonEpisode(merged);
        setTmdbNameBySeasonEpisode(names);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, seasonListKey]);

  const getPreferredThumb = useMemo(() => {
    return (seasonNum: number, episodeNumber: number | null, fallback: string | null) => {
      if (episodeNumber != null && episodeNumber > 0) {
        const k = `${seasonNum}:${episodeNumber}`;
        if (tmdbStillBySeasonEpisode[k]) return tmdbStillBySeasonEpisode[k];
      }
      return fallback;
    };
  }, [tmdbStillBySeasonEpisode]);

  const currentEpisode = useMemo(() => {
    for (const s of seriesEpisodes.seasons) {
      const e = s.episodes.find((x) => x.id === selectedEpisodeVariantId);
      if (e) return e;
    }
    return null;
  }, [seriesEpisodes.seasons, selectedEpisodeVariantId]);

  return (
    <div className="space-y-8">
      {episodesInLibraryCount != null && episodesInLibraryCount > 0 && (
        <p className="text-sm text-white/70">
          {episodesInLibraryCount === 1
            ? t('library.episodesInLibrary', { count: 1 })
            : t('library.episodesInLibrary_plural', { count: episodesInLibraryCount })}
        </p>
      )}

      {hasSavedPosition && currentEpisode && (
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm"
          role="region"
          aria-label={t('dashboard.resumeWatching')}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 mb-0.5">{t('dashboard.resumeWatching')}</p>
            <p className="text-lg font-semibold text-white truncate">
              {currentEpisode.episode === 0
                ? t('mediaDetail.fullPack')
                : t('mediaDetail.episodeWithTitle', {
                    number: currentEpisode.episode,
                    title: currentEpisode.name || t('mediaDetail.episodeNumber', { number: currentEpisode.episode }),
                  })}
            </p>
          </div>
        </div>
      )}

      {seriesEpisodes.seasons.map((seasonData) => {
        const seasonNum = seasonData.season;
        const episodes = seasonData.episodes ?? [];
        if (!episodes.length) return null;

        const episodeCount = episodes.length;
        const headingId = `series-season-${seasonNum}-heading`;

        return (
          <section
            key={seasonNum}
            aria-labelledby={headingId}
            className="rounded-xl overflow-hidden bg-black/40 border border-white/10"
          >
            <div className="px-4 py-3 border-b border-white/10 bg-white/5">
              <h3 id={headingId} className="text-base font-semibold text-white">
                {t('mediaDetail.seasonNumber', { number: seasonNum })}
                <span className="ml-2 text-sm font-normal text-white/60">({episodeCount})</span>
              </h3>
            </div>
            <EpisodeCardsCarousel
              ariaLabel={`${t('mediaDetail.seasonNumber', { number: seasonNum })} — ${t('mediaDetail.episodes')}`}
              items={episodes.map((ep) => {
                const epKey = `${ep.season}:${ep.episode}`;
                const downloaded = downloadedEpisodesSet?.has(epKey) ?? false;
                const isSelected = selectedEpisodeVariantId === ep.id;
                const tmdbEpisodeName =
                  ep.episode === 0 ? null : tmdbNameBySeasonEpisode[`${ep.season}:${ep.episode}`] ?? null;
                const title =
                  ep.episode === 0
                    ? t('mediaDetail.fullPack')
                    : tmdbEpisodeName
                      ? t('mediaDetail.episodeWithTitle', { number: ep.episode, title: tmdbEpisodeName })
                      : ep.name?.trim()
                        ? t('mediaDetail.episodeWithTitle', { number: ep.episode, title: ep.name })
                      : t('mediaDetail.episodeNumber', { number: ep.episode });

                const watched =
                  typeof tmdbId === 'number' && ep.episode > 0
                    ? watchedSet?.has(watchedEpisodeKey(ep.season, ep.episode)) ?? false
                    : false;
                return {
                  key: ep.id,
                  episodeNumber: ep.episode === 0 ? '—' : ep.episode,
                  title,
                  subtitle: null,
                  thumbnailUrl: getPreferredThumb(
                    ep.season,
                    typeof ep.episode === 'number' && ep.episode > 0 ? ep.episode : null,
                    ep.info_hash && ep.file_path
                      ? `/api/media/episode-thumbnail?info_hash=${encodeURIComponent(ep.info_hash)}&t=60&w=480`
                      : null,
                  ),
                  watched,
                  isAvailable: !!ep.info_hash,
                  isDownloaded: !!ep.file_path || downloaded,
                  isDownloading: isSelected ? isDownloading : false,
                  downloadProgress: isSelected ? downloadProgress : undefined,
                  statusMessage: isSelected ? statusMessage : null,
                  isSelected,
                  onSelect: () => onSelectEpisode(ep.id),
                  isTV,
                };
              })}
            />
          </section>
        );
      })}
    </div>
  );
}
