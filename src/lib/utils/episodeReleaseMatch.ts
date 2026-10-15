import {
  type CourStarts,
  scenePackMatchesTmdbEpisode,
  tmdbAbsoluteToScene,
} from './tmdbSceneSeasonMap';
import { absoluteEpisodeNumber } from './seasonOrder';

/**
 * True si le nom de release contient le couple saison / épisode attendu.
 * Couvre S01E05, S1E5, S01.E05 et le style très courant sur les indexeurs **1x05** (saison 1, ép. 5).
 *
 * Avec `seasonEpisodeCounts` (issus de TMDB multi-saisons), accepte en fallback les tags
 * « absolus » S01E{n} qui dépassent la taille TMDB de la saison 1.
 */
export function episodeReleaseMatchesVariantName(
  seasonNum: number,
  epNum: number,
  rawName: string,
  opts?: { seasonEpisodeCounts?: Map<number, number> },
): boolean {
  const upper = (rawName || '').trim().toUpperCase();
  if (!upper) return false;

  if (matchesExactSeasonEpisode(seasonNum, epNum, upper)) return true;

  const counts = opts?.seasonEpisodeCounts;
  if (counts && seasonNum > 1 && epNum > 0) {
    const abs = absoluteEpisodeNumber(seasonNum, epNum, counts);
    if (abs !== epNum && matchesExactSeasonEpisode(1, abs, upper)) return true;
  }

  return false;
}

function matchesExactSeasonEpisode(seasonNum: number, epNum: number, upper: string): boolean {
  const sPad = seasonNum.toString().padStart(2, '0');
  const ePad = epNum.toString().padStart(2, '0');
  if (new RegExp(`S\\.?${sPad}[\\s._-]?E\\.?${ePad}\\b`).test(upper)) return true;

  for (const m of upper.matchAll(/\bS\.?(\d{1,2})\s*[\s._-]?\s*E\.?(\d{1,3})\b/gi)) {
    if (parseInt(m[1], 10) === seasonNum && parseInt(m[2], 10) === epNum) return true;
  }

  for (const m of upper.matchAll(/\b(\d{1,2})X(\d{1,3})\b/gi)) {
    if (parseInt(m[1], 10) === seasonNum && parseInt(m[2], 10) === epNum) return true;
  }

  return false;
}

export type EpisodeReleaseMatchOptions = {
  /** TMDB n’a qu’une saison réelle (1) alors que les indexeurs publient S02, S03… */
  continuous?: boolean;
  /** Débuts de cour en numérotation absolue TMDB (ex. [1, 25, 49]). */
  courStarts?: CourStarts | null;
  /** Tailles de saisons TMDB (séries multi-saisons classiques). */
  seasonEpisodeCounts?: Map<number, number>;
};

/**
 * Match épisode TMDB ↔ nom de release, y compris remap anime saison continue
 * (TMDB S01E25 ↔ Les.Carnets….S02E01…).
 */
export function episodeReleaseMatchesTmdbEpisode(
  tmdbSeason: number,
  tmdbEpisode: number,
  rawName: string,
  opts?: EpisodeReleaseMatchOptions,
): boolean {
  if (
    episodeReleaseMatchesVariantName(tmdbSeason, tmdbEpisode, rawName, {
      seasonEpisodeCounts: opts?.seasonEpisodeCounts,
    })
  ) {
    return true;
  }

  if (
    opts?.continuous &&
    tmdbSeason === 1 &&
    tmdbEpisode > 0 &&
    opts.courStarts &&
    opts.courStarts.length > 1
  ) {
    const scene = tmdbAbsoluteToScene(tmdbEpisode, opts.courStarts);
    if (episodeReleaseMatchesVariantName(scene.season, scene.episode, rawName)) return true;
  }

  return false;
}

/** Match épisode ou pack saison (S02 COMPLETE) pour une case TMDB. */
export function torrentReleaseMatchesTmdbEpisode(
  tmdbSeason: number,
  tmdbEpisode: number,
  rawName: string,
  opts?: EpisodeReleaseMatchOptions,
): boolean {
  if (episodeReleaseMatchesTmdbEpisode(tmdbSeason, tmdbEpisode, rawName, opts)) return true;
  return scenePackMatchesTmdbEpisode(tmdbSeason, tmdbEpisode, rawName, opts);
}
