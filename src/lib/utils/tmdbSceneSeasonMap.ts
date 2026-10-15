/**
 * Mapping entre la numérotation TMDB « saison continue » (ex. Les Carnets de l'apothicaire :
 * une seule saison TMDB avec E1–E60) et la numérotation scène / indexeurs (S01, S02, S03…).
 *
 * Exemple : TMDB S01E25 ↔ scène S02E01 quand les cours démarrent en 1, 25, 49.
 */

export type CourStarts = number[];

const AIR_DATE_GAP_DAYS = 60;

/** True si la grille TMDB n’a qu’une saison « réelle » (1), hors saison 0 (spéciaux). */
export function isContinuousTmdbSeasonLayout(seasonNumbers: number[]): boolean {
  const main = seasonNumbers.filter((s) => s > 0);
  return main.length === 1 && main[0] === 1;
}

/**
 * Détecte les débuts de cour via les trous d’air date (≥ 60 jours).
 * Retourne les numéros d’épisode absolus TMDB qui démarrent chaque cour (ex. [1, 25, 49]).
 */
export function inferCourStartsFromAirDates(
  episodes: Array<{ episode: number; airDate?: string | null }>,
  gapDays: number = AIR_DATE_GAP_DAYS,
): CourStarts {
  const sorted = [...episodes]
    .filter((e) => typeof e.episode === 'number' && e.episode > 0)
    .sort((a, b) => a.episode - b.episode);
  if (!sorted.length) return [1];

  const starts: CourStarts = [sorted[0].episode];
  for (let i = 1; i < sorted.length; i++) {
    // Uniquement les paires d'épisodes consécutifs (N → N+1) :
    // sinon un trou E1…E24 dans un échantillon partiel compte comme hiatus de cour.
    if (sorted[i].episode !== sorted[i - 1].episode + 1) continue;
    const prev = sorted[i - 1].airDate;
    const cur = sorted[i].airDate;
    if (!prev || !cur) continue;
    const d1 = Date.parse(prev);
    const d2 = Date.parse(cur);
    if (Number.isNaN(d1) || Number.isNaN(d2)) continue;
    const days = (d2 - d1) / 86_400_000;
    if (days >= gapDays) starts.push(sorted[i].episode);
  }
  return starts;
}

/**
 * Fallback sans air dates : taille de cour depuis le max S01Exx des releases,
 * sinon découpe égale selon le max de saison scène observé.
 */
export function inferCourStartsFromSceneVariants(
  tmdbEpisodeCount: number,
  variantNames: string[],
): CourStarts | null {
  let maxSeason = 1;
  const maxEpBySeason = new Map<number, number>();

  for (const name of variantNames) {
    const upper = (name || '').toUpperCase();
    for (const m of upper.matchAll(/\bS\.?(\d{1,2})(?:[\s._-]*E\.?(\d{1,3}))?\b/g)) {
      const s = parseInt(m[1], 10);
      if (s < 1 || s > 40) continue;
      maxSeason = Math.max(maxSeason, s);
      if (m[2]) {
        const e = parseInt(m[2], 10);
        if (e > 0) maxEpBySeason.set(s, Math.max(maxEpBySeason.get(s) ?? 0, e));
      }
    }
  }

  if (maxSeason <= 1) return null;

  const s1max = maxEpBySeason.get(1);
  if (s1max && s1max >= 8) {
    const starts: CourStarts = [1];
    for (let s = 2; s <= maxSeason; s++) {
      starts.push(1 + s1max * (s - 1));
    }
    return starts;
  }

  // Anime / cours Netflix : sans max S01Exx (pack S01 + S03E02 seuls), un découpage
  // égal (60/3 → [1,21,41]) casse E25→S02E01. Préférer des cours de 24.
  const ANIME_COUR = 24;
  if (
    maxSeason >= 2 &&
    tmdbEpisodeCount >= ANIME_COUR * (maxSeason - 1) + 6 &&
    tmdbEpisodeCount >= maxSeason * 12
  ) {
    const starts: CourStarts = [1];
    for (let s = 2; s <= maxSeason; s++) {
      starts.push(1 + ANIME_COUR * (s - 1));
    }
    if (starts[starts.length - 1]! <= tmdbEpisodeCount) {
      return starts;
    }
  }

  if (tmdbEpisodeCount < maxSeason * 6) return null;
  const courSize = Math.floor(tmdbEpisodeCount / maxSeason);
  if (courSize < 6) return null;
  const starts: CourStarts = [1];
  for (let s = 2; s <= maxSeason; s++) {
    starts.push(1 + courSize * (s - 1));
  }
  return starts;
}

/** Épisode absolu TMDB → couple saison/épisode scène. */
export function tmdbAbsoluteToScene(
  absoluteEpisode: number,
  courStarts: CourStarts,
): { season: number; episode: number } {
  if (absoluteEpisode <= 0 || !courStarts.length) {
    return { season: 1, episode: Math.max(1, absoluteEpisode) };
  }
  let season = 1;
  let start = courStarts[0] ?? 1;
  for (let i = 0; i < courStarts.length; i++) {
    if (absoluteEpisode >= courStarts[i]) {
      season = i + 1;
      start = courStarts[i];
    }
  }
  return { season, episode: absoluteEpisode - start + 1 };
}

/** Couple scène → épisode absolu TMDB (saison continue). */
export function sceneToTmdbAbsolute(
  sceneSeason: number,
  sceneEpisode: number,
  courStarts: CourStarts,
): number | null {
  if (sceneSeason < 1 || sceneEpisode < 1 || !courStarts.length) return null;
  const idx = sceneSeason - 1;
  if (idx >= courStarts.length) return null;
  return courStarts[idx] + sceneEpisode - 1;
}

export function parseSceneSeasonFromName(rawName: string): number | null {
  const m = (rawName || '').match(/\bS\.?(\d{1,2})\b/i);
  if (!m) return null;
  const s = parseInt(m[1], 10);
  return s >= 0 && s <= 40 ? s : null;
}

/** Pack saison (S02 sans Exx / COMPLETE / INTEGRALE). */
export function isSeasonPackReleaseName(rawName: string): boolean {
  const upper = (rawName || '').toUpperCase();
  if (!upper) return false;
  if (/\bS\.?\d{1,2}[\s._-]*E\.?\d{1,3}\b/i.test(upper)) return false;
  if (/\b\d{1,2}X\d{1,3}\b/i.test(upper)) return false;
  if (/\bS\.?\d{1,2}\b/i.test(upper)) return true;
  return upper.includes('COMPLETE') || upper.includes('INTEGRALE') || upper.includes('SAISON');
}

/**
 * Un pack scène S0N correspond-il à l’épisode TMDB (saison continue) ?
 * S02 pack → épisodes du 2ᵉ cour uniquement.
 * Important : en mode continu, ne PAS faire matcher un pack S01 sur E25+
 * (sinon lecture cassée : fichiers S01E01–E24 pour une case S01E25).
 */
export function scenePackMatchesTmdbEpisode(
  tmdbSeason: number,
  tmdbEpisode: number,
  rawName: string,
  opts?: { courStarts?: CourStarts | null; continuous?: boolean },
): boolean {
  if (!isSeasonPackReleaseName(rawName)) return false;
  const packSeason = parseSceneSeasonFromName(rawName);

  if (
    opts?.continuous &&
    tmdbSeason === 1 &&
    tmdbEpisode > 0 &&
    opts.courStarts &&
    opts.courStarts.length > 1
  ) {
    if (packSeason == null || packSeason < 1) return false;
    const scene = tmdbAbsoluteToScene(tmdbEpisode, opts.courStarts);
    return packSeason === scene.season;
  }

  if (packSeason != null && packSeason === tmdbSeason) return true;

  return false;
}
