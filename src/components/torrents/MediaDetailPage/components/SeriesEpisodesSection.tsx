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

/** Stills/noms indexés par numéro d’épisode absolu TMDB (saison continue). */
function extractTmdbStillsAndNamesByAbsolute(
  episodes: Array<{ episode_number?: number; still_path?: string | null; name?: string | null }>,
): { stills: Record<number, string>; names: Record<number, string> } {
  const stills: Record<number, string> = {};
  const names: Record<number, string> = {};
  for (const ep of episodes) {
    const num = typeof ep?.episode_number === 'number' ? ep.episode_number : null;
    if (num == null || num <= 0) continue;
    const stillPath = typeof ep?.still_path === 'string' ? ep.still_path : null;
    if (stillPath) stills[num] = `https://image.tmdb.org/t/p/w780${stillPath}`;
    const episodeName = typeof ep?.name === 'string' ? ep.name.trim() : '';
    if (episodeName && !isGenericEpisodeName(episodeName, num)) names[num] = episodeName;
  }
  return { stills, names };
}

/** Anime découpé en cours scène : les stills TMDB restent sur S1 absolue (E25 → UI S02E01). */
function usesContinuousTmdbAbsoluteMap(
  seasons: SeriesEpisodesResponse['seasons'],
): boolean {
  return seasons.some((s) =>
    s.episodes.some((e) => typeof e.tmdbAbsoluteEpisode === 'number' && e.tmdbAbsoluteEpisode > 0),
  );
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

  const absoluteMapKey = useMemo(() => {
    if (!usesContinuousTmdbAbsoluteMap(seriesEpisodes.seasons)) return '';
    return seriesEpisodes.seasons
      .flatMap((s) =>
        s.episodes
          .filter((e) => e.episode > 0 && e.tmdbAbsoluteEpisode != null)
          .map((e) => `${s.season}:${e.episode}=${e.tmdbAbsoluteEpisode}`),
      )
      .join('|');
  }, [seriesEpisodes.seasons]);

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

    const continuousAbsolute = usesContinuousTmdbAbsoluteMap(seriesEpisodes.seasons);

    (async () => {
      const merged: Record<string, string> = {};
      const names: Record<string, string> = {};

      if (continuousAbsolute) {
        // TMDB n’a qu’une saison continue : season/2|3 → 502. Charger S1 (+ S0 spéciaux).
        type TmdbEp = {
          episode_number?: number;
          still_path?: string | null;
          name?: string | null;
        };
        const loadAbsSeason = async (tmdbSeasonNum: number, lang: string): Promise<TmdbEp[] | null> => {
          const attempt = async () => {
            const res = await serverApi.getTmdbTvSeasonDetail(tmdbId, tmdbSeasonNum, lang);
            if (!res?.success || !res.data || !Array.isArray(res.data.episodes)) return null;
            return res.data.episodes as TmdbEp[];
          };
          let eps = await attempt();
          // 502 / CORS intermittents côté gateway → un retry évite des cartes noires aléatoires
          if ((!eps || eps.length === 0) && !cancelled) {
            await new Promise((r) => setTimeout(r, 700));
            if (cancelled) return null;
            eps = await attempt();
          }
          return eps;
        };

        const primaryEps = (await loadAbsSeason(1, tmdbLanguage)) ?? [];
        if (cancelled) return;
        // Échec total : garder les stills déjà affichées (évite flash noir)
        if (primaryEps.length === 0) return;
        const byAbs = extractTmdbStillsAndNamesByAbsolute(primaryEps);

        let enByAbs: { stills: Record<number, string>; names: Record<number, string> } | null = null;
        const absMissingNames = Object.keys(byAbs.stills)
          .map(Number)
          .filter((n) => !byAbs.names[n]);
        // Aussi les abs présents dans l’UI même sans still
        for (const s of seriesEpisodes.seasons) {
          for (const e of s.episodes) {
            const abs = e.tmdbAbsoluteEpisode;
            if (typeof abs === 'number' && abs > 0 && !byAbs.names[abs]) absMissingNames.push(abs);
          }
        }
        if (absMissingNames.length > 0 && !tmdbLanguage.startsWith('en')) {
          const enEps = await loadAbsSeason(1, 'en-US');
          if (cancelled) return;
          if (enEps) enByAbs = extractTmdbStillsAndNamesByAbsolute(enEps);
        }

        for (const s of seriesEpisodes.seasons) {
          if (s.season === 0) continue;
          for (const e of s.episodes) {
            if (e.episode <= 0) continue;
            const abs =
              typeof e.tmdbAbsoluteEpisode === 'number' && e.tmdbAbsoluteEpisode > 0
                ? e.tmdbAbsoluteEpisode
                : null;
            if (abs == null) continue;
            const key = `${e.season}:${e.episode}`;
            if (byAbs.stills[abs]) merged[key] = byAbs.stills[abs];
            if (byAbs.names[abs]) names[key] = byAbs.names[abs];
            else if (enByAbs?.names[abs]) names[key] = enByAbs.names[abs];
          }
        }

        if (seasons.includes(0)) {
          const specials = (await loadAbsSeason(0, tmdbLanguage)) ?? [];
          if (cancelled) return;
          const extracted = extractTmdbStillsAndNames(0, specials);
          Object.assign(merged, extracted.stills);
          Object.assign(names, extracted.names);
        }
      } else {
        await Promise.all(
          seasons.map(async (seasonNum) => {
            const primary = await serverApi.getTmdbTvSeasonDetail(tmdbId, seasonNum, tmdbLanguage);
            if (cancelled) return;
            const primaryEps =
              primary?.success && primary.data && Array.isArray(primary.data.episodes)
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
      }

      if (!cancelled) {
        setTmdbStillBySeasonEpisode(merged);
        setTmdbNameBySeasonEpisode(names);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, seasonListKey, absoluteMapKey, tmdbLanguage, seriesEpisodes.seasons]);

  const getPreferredThumb = useMemo(() => {
    return (seasonNum: number, episodeNumber: number | null, fallback: string | null) => {
      if (episodeNumber != null && episodeNumber > 0) {
        const k = `${seasonNum}:${episodeNumber}`;
        if (tmdbStillBySeasonEpisode[k]) return tmdbStillBySeasonEpisode[k];
      }
      return fallback;
    };
  }, [tmdbStillBySeasonEpisode]);

  const orderedSeasons = useMemo(() => {
    return [...seriesEpisodes.seasons].sort((a, b) => {
      if (a.season === 0) return 1;
      if (b.season === 0) return -1;
      return a.season - b.season;
    });
  }, [seriesEpisodes.seasons]);

  const seasonLabel = (seasonNum: number) =>
    seasonNum === 0
      ? t('mediaDetail.seasonSpecials')
      : t('mediaDetail.seasonNumber', { number: seasonNum });

  return (
    <div className="space-y-6">
      {orderedSeasons.map((seasonData) => {
        const seasonNum = seasonData.season;
        const episodes = seasonData.episodes ?? [];
        if (!episodes.length) return null;

        const episodeCount = episodes.length;
        const headingId = `series-season-${seasonNum}-heading`;
        const label = seasonLabel(seasonNum);

        return (
          <section
            key={seasonNum}
            aria-labelledby={headingId}
            data-tv-episode-row
            className="ed-season-block"
          >
            <div className="ed-season-block__head px-1 pb-2">
              <h3 id={headingId} className="ed-season-block__title text-base font-semibold text-white">
                {label}
                <span className="ed-season-block__count ml-2 text-sm font-normal text-white/60">
                  ({episodeCount})
                </span>
              </h3>
            </div>
            <EpisodeCardsCarousel
              ariaLabel={`${label} — ${t('mediaDetail.episodes')}`}
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
