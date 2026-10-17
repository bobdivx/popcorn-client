/**
 * Navigation épisode précédent / suivant (lecteur séries).
 * - Ordre (saison, épisode) croissant, indépendant de l’ordre de l’API.
 * - Franchit les saisons (S01E10 → S02E01, S02E01 → dernier de S01).
 * - Ignore les packs (épisode 0) et les spéciaux (saison 0), sauf si on y est déjà.
 * - Doublons (plusieurs variantes d’un même épisode) : on saute au numéro suivant/précédent.
 */
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';

export interface AdjacentEpisodeInfo {
  seasonNum: number;
  episodeVariantId: string;
  title: string;
  /** Numéro d’épisode TMDB (0 = pack). */
  episodeNum: number;
}

type EpLite = { id: string; season: number; episode: number; order: number };

function cmp(a: { season: number; episode: number }, b: { season: number; episode: number }): number {
  return a.season !== b.season ? a.season - b.season : a.episode - b.episode;
}

export function getAdjacentEpisode(
  seriesEpisodes: Pick<SeriesEpisodesResponse, 'seasons'> | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null,
  direction: 1 | -1,
): AdjacentEpisodeInfo | null {
  if (!seriesEpisodes?.seasons?.length || selectedSeasonNum == null || selectedEpisodeVariantId == null) {
    return null;
  }
  const all: EpLite[] = [];
  let order = 0;
  for (const s of seriesEpisodes.seasons) {
    for (const e of s.episodes ?? []) {
      if (!e || typeof e.id !== 'string') continue;
      const epNum = typeof e.episode === 'number' ? e.episode : Number(e.episode);
      all.push({ id: e.id, season: s.season, episode: Number.isFinite(epNum) ? epNum : 0, order: order++ });
    }
  }
  const current =
    all.find((e) => e.id === selectedEpisodeVariantId && e.season === selectedSeasonNum) ??
    all.find((e) => e.id === selectedEpisodeVariantId);
  if (!current) return null;
  // Pack complet : comportement historique (ordre API dans la même liste).
  if (current.episode === 0) {
    const idx = all.indexOf(current);
    const cand = all[idx + direction];
    if (!cand) return null;
    return toInfo(cand);
  }
  const pool = all.filter(
    (e) => e.episode > 0 && (e.season > 0 || current.season === 0) && e.id !== current.id,
  );
  let best: EpLite | null = null;
  for (const e of pool) {
    const c = cmp(e, current);
    if (direction === 1 ? c <= 0 : c >= 0) continue;
    if (!best) {
      best = e;
      continue;
    }
    const d = cmp(e, best);
    if (direction === 1 ? d < 0 : d > 0) best = e;
    else if (d === 0 && e.order < best.order) best = e;
  }
  return best ? toInfo(best) : null;
}

function toInfo(e: EpLite): AdjacentEpisodeInfo {
  return {
    seasonNum: e.season,
    episodeVariantId: e.id,
    title: e.episode === 0 ? 'Pack complet' : `S${e.season} E${e.episode}`,
    episodeNum: e.episode,
  };
}

export function getNextEpisodeInfo(
  seriesEpisodes: Pick<SeriesEpisodesResponse, 'seasons'> | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null,
): AdjacentEpisodeInfo | null {
  return getAdjacentEpisode(seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId, 1);
}

export function getPreviousEpisodeInfo(
  seriesEpisodes: Pick<SeriesEpisodesResponse, 'seasons'> | null | undefined,
  selectedSeasonNum: number | null,
  selectedEpisodeVariantId: string | null,
): AdjacentEpisodeInfo | null {
  return getAdjacentEpisode(seriesEpisodes, selectedSeasonNum, selectedEpisodeVariantId, -1);
}
