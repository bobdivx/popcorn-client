import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';
import { serverApi } from '../../../../lib/client/server-api';
import { watchedEpisodeKey } from '../../../../lib/streaming/torrent-storage';
import { isGenericEpisodeName } from '../utils/isGenericEpisodeName';
import { EpisodeCardsCarousel } from './EpisodeCardsCarousel';

function extractTmdbStillsAndNames(
  seasonNum: number,
  episodes: Array<{ episode_number?: number; still_path?: string | null; name?: string | null }>,
): { stills: Record<string, string>; names: Record<string, string> } {
  const stills: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const ep of episodes) {
    const num = typeof ep?.episode_number === 'number' ? ep.episode_number : null;
    if (num == null || num <= 0) continue;
    const key = `${seasonNum}:${num}`;
    const stillPath = typeof ep?.still_path === 'string' ? ep.still_path : null;
    if (stillPath) stills[key] = `https://image.tmdb.org/t/p/w780${stillPath}`;
    const episodeName = typeof ep?.name === 'string' ? ep.name.trim() : '';
    if (episodeName && !isGenericEpisodeName(episodeName, num)) names[key] = episodeName;
  }
  return { stills, names };
}

export interface SeriesEpisodesSectionProps {
  seriesEpisodes: SeriesEpisodesResponse;
  tmdbId?: number | null;
  selectedEpisodeVariantId: string | null;
  onSelectEpisode: (episodeVariantId: string) => void;
  savedPlaybackPosition: number | null;
  downloadedEpisodesSet?: Set<string>;
  watchedSet?: Set<string>;
  isTV?: boolean;
  /** Torrent info pour l'épisode sélectionné */
  isDownloading?: boolean;
  downloadProgress?: number;
  statusMessage?: string | null;
  downloadingEpisodesMap?: Record<string, number>;
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
  downloadedEpisodesSet,
  watchedSet,
  isTV,
  isDownloading,
  downloadProgress,
  statusMessage,
  downloadingEpisodesMap,
}: SeriesEpisodesSectionProps) {
  const { t, language } = useI18n();
  const hasSavedPosition = savedPlaybackPosition != null && savedPlaybackPosition > 0;
  /** Clés : `${season}:${episodeNumber}` (TMDB par saison ; numéros d'épisode peuvent se répéter entre saisons). */
  const [tmdbStillBySeasonEpisode, setTmdbStillBySeasonEpisode] = useState<Record<string, string>>({});
  const [tmdbNameBySeasonEpisode, setTmdbNameBySeasonEpisode] = useState<Record<string, string>>({});

  const seasonListKey = useMemo(
    () => seriesEpisodes.seasons.map((s) => s.season).join(','),
    [seriesEpisodes.seasons],
  );

  const tmdbLanguage = language === 'en' ? 'en-US' : 'fr-FR';

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
          const primary = await serverApi.getTmdbTvSeasonDetail(tmdbId, seasonNum, tmdbLanguage);
          if (cancelled) return;
          const primaryEps = primary?.success && primary.data && Array.isArray(primary.data.episodes)
            ? primary.data.episodes
            : [];
          const extracted = extractTmdbStillsAndNames(seasonNum, primaryEps);
          Object.assign(merged, extracted.stills);
          Object.assign(names, extracted.names);

          // Titres FR souvent « Épisode N » non traduits → fallback en-US
          const missing = primaryEps
            .map((ep: { episode_number?: number }) => ep?.episode_number)
            .filter((n: number | undefined): n is number => typeof n === 'number' && n > 0)
            .filter((n: number) => !names[`${seasonNum}:${n}`]);
          if (missing.length > 0 && !tmdbLanguage.startsWith('en')) {
            const en = await serverApi.getTmdbTvSeasonDetail(tmdbId, seasonNum, 'en-US');
            if (cancelled) return;
            if (en?.success && en.data && Array.isArray(en.data.episodes)) {
              const enNames = extractTmdbStillsAndNames(seasonNum, en.data.episodes).names;
              for (const n of missing) {
                const key = `${seasonNum}:${n}`;
                if (enNames[key]) names[key] = enNames[key];
              }
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
  }, [tmdbId, seasonListKey, tmdbLanguage]);

  const getPreferredThumb = useMemo(() => {
    return (seasonNum: number, episodeNumber: number | null, fallback: string | null) => {
      if (episodeNumber != null && episodeNumber > 0) {
        const k = `${seasonNum}:${episodeNumber}`;
        if (tmdbStillBySeasonEpisode[k]) return tmdbStillBySeasonEpisode[k];
      }
      return fallback;
    };
  }, [tmdbStillBySeasonEpisode]);

  return (
    <div className="space-y-8">
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
              items={(() => {
                const seasonHasPackSource = episodes.some((e) => {
                  if (e.episode !== 0) return false;
                  const packIndexerId =
                    typeof e.id === 'string' &&
                    e.id.trim().length > 0 &&
                    !e.id.startsWith('popcorn_tmdb_');
                  return Boolean(e.info_hash) || packIndexerId;
                });
                return episodes.map((ep) => {
                const epKey = `${ep.season}:${ep.episode}`;
                const downloaded = downloadedEpisodesSet?.has(epKey) ?? false;
                const isSelected = selectedEpisodeVariantId === ep.id;
                const tmdbEpisodeName =
                  ep.episode === 0 ? null : tmdbNameBySeasonEpisode[`${ep.season}:${ep.episode}`] ?? null;
                const apiName = ep.name?.trim() || '';
                const usableApiName =
                  apiName && !isGenericEpisodeName(apiName, ep.episode) ? apiName : null;
                const episodeTitle = tmdbEpisodeName || usableApiName;
                const title =
                  ep.episode === 0
                    ? t('mediaDetail.fullPack')
                    : episodeTitle || t('mediaDetail.episodeNumber', { number: ep.episode });

                const watched =
                  typeof tmdbId === 'number' && ep.episode > 0
                    ? watchedSet?.has(watchedEpisodeKey(ep.season, ep.episode)) ?? false
                    : false;
                // Indexeur : souvent variante avec id BDD mais magnet sans hash 40c encore résolu.
                const hasIndexerVariant =
                  typeof ep.id === 'string' &&
                  ep.id.trim().length > 0 &&
                  !ep.id.startsWith('popcorn_tmdb_');
                // Pack MULTI : les épisodes 1..N n'ont pas de release dédiée mais le pack (ep 0) oui.
                const availableViaSeasonPack = ep.episode > 0 && seasonHasPackSource;
                const downloadingProgress = downloadingEpisodesMap?.[epKey];
                const currentlyDownloading = downloadingProgress !== undefined;

                  const finalIsDownloaded = !!ep.file_path || downloaded;
                  // Stats pairs : uniquement si > 0 (bibliothèque locale → souvent 0, inutile d’afficher).
                  const seedCount =
                    typeof ep.seed_count === 'number' && ep.seed_count > 0 ? ep.seed_count : undefined;
                  const leechCount =
                    typeof ep.leech_count === 'number' && ep.leech_count > 0 ? ep.leech_count : undefined;
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
                    // Un épisode déjà en bibliothèque doit apparaître comme disponible même
                    // si l'API séries n'a pas encore renseigné info_hash sur cet item.
                    isAvailable:
                      !!ep.info_hash ||
                      downloaded ||
                      hasIndexerVariant ||
                      availableViaSeasonPack ||
                      currentlyDownloading,
                    isDownloaded: finalIsDownloaded,
                    isDownloading: !finalIsDownloaded && ((isSelected ? isDownloading : false) || currentlyDownloading),
                    downloadProgress: isSelected && downloadProgress !== undefined ? downloadProgress : (currentlyDownloading ? downloadingProgress : undefined),
                    statusMessage: isSelected
                      ? statusMessage
                      : currentlyDownloading
                        ? 'Téléchargement…'
                        : null,
                    seedCount,
                    leechCount,
                    canResume: isSelected && hasSavedPosition,
                  isSelected,
                  onSelect: () => onSelectEpisode(ep.id),
                  isTV,
                };
              });
              })()}
            />
          </section>
        );
      })}
    </div>
  );
}
