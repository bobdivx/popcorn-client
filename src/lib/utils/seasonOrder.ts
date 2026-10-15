/**
 * Tri des saisons : S1, S2, … puis S0 (spéciaux) en dernier.
 */
export function seasonSortKey(season: number): number {
  return season === 0 ? Number.MAX_SAFE_INTEGER : season;
}

export function compareSeasonNumbers(a: number, b: number): number {
  return seasonSortKey(a) - seasonSortKey(b);
}

/** Nombre max d’épisode par saison régulière (saison > 0), depuis une grille TMDB. */
export function seasonEpisodeCountsFromSeasons(
  seasons: Array<{ season: number; episodes?: Array<{ episode: number }> }>,
): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of seasons) {
    if (s.season <= 0) continue;
    const eps = (s.episodes ?? []).filter((e) => e.episode > 0);
    if (!eps.length) {
      m.set(s.season, 0);
      continue;
    }
    m.set(
      s.season,
      eps.reduce((max, e) => Math.max(max, e.episode), 0),
    );
  }
  return m;
}

/**
 * Convertit (saison TMDB, épisode relatif) → index « absolu » en cumulant
 * les tailles de saisons TMDB 1..(season-1). Sert uniquement au matching
 * de fichiers mal tagués (S01E25…), jamais comme vérité métier hardcodée.
 */
export function absoluteEpisodeNumber(
  season: number,
  episode: number,
  seasonCounts: Map<number, number>,
): number {
  if (season <= 1) return episode;
  let abs = episode;
  for (let s = 1; s < season; s++) {
    abs += seasonCounts.get(s) ?? 0;
  }
  return abs;
}

/**
 * Inverse : numéro absolu sous S01 → (saison, épisode) TMDB via les tailles de saisons.
 * Ex. abs=25, S1=24 → { season: 2, episode: 1 }.
 */
export function relativeEpisodeFromAbsolute(
  absoluteEpisode: number,
  seasonCounts: Map<number, number>,
): { season: number; episode: number } | null {
  if (absoluteEpisode <= 0) return null;
  const regular = [...seasonCounts.keys()].filter((s) => s > 0).sort((a, b) => a - b);
  if (!regular.length) return null;
  let remaining = absoluteEpisode;
  for (const season of regular) {
    const count = seasonCounts.get(season) ?? 0;
    if (count <= 0) continue;
    if (remaining <= count) return { season, episode: remaining };
    remaining -= count;
  }
  return null;
}

/** Clés map à essayer pour un slot TMDB (exact puis absolu S01E{n}). */
export function episodeKeyCandidates(
  season: number,
  episode: number,
  seasonCounts?: Map<number, number> | null,
): string[] {
  const keys = [`${season}:${episode}`];
  if (seasonCounts && season > 1 && episode > 0) {
    const abs = absoluteEpisodeNumber(season, episode, seasonCounts);
    if (abs !== episode) keys.push(`1:${abs}`);
  }
  return keys;
}

export function lookupBySeasonEpisodeKey<T>(
  map: Record<string, T>,
  season: number,
  episode: number,
  seasonCounts?: Map<number, number> | null,
): T | undefined {
  for (const key of episodeKeyCandidates(season, episode, seasonCounts)) {
    const v = map[key];
    if (v != null && v !== ('' as unknown as T)) return v;
  }
  return undefined;
}

/** True si un release (S,E) littéral correspond au slot TMDB (exact ou absolu S01). */
export function releaseMatchesTmdbEpisode(
  releaseSeason: number,
  releaseEpisode: number,
  tmdbSeason: number,
  tmdbEpisode: number,
  seasonCounts?: Map<number, number> | null,
): boolean {
  if (releaseSeason === tmdbSeason && releaseEpisode === tmdbEpisode) return true;
  if (!seasonCounts || tmdbSeason <= 1 || tmdbEpisode <= 0) return false;
  const abs = absoluteEpisodeNumber(tmdbSeason, tmdbEpisode, seasonCounts);
  return releaseSeason === 1 && releaseEpisode === abs;
}
