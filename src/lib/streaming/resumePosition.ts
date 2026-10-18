/**
 * Résolution unique de la position de reprise (toutes entrées : carte, « Continuer », fiche,
 * bouton Lecture, épisode de série ; web, TV, Android).
 *
 * Les cartes affichent la progression depuis `watchedMovies` / `watchedEpisodes` (synchronisés
 * avec le serveur) et la rangée « Continuer » depuis l'API resume-watching, alors que le lecteur
 * ne lisait que `playback_position_media_<tmdb>_<type>_<deviceId>` (localStorage, propre à
 * l'appareil et à la série entière). Résultat : barre de progression visible, lecture à 0.
 * Ici on agrège toutes les sources, on garde la plus récente et — pour une série — seulement
 * celles de l'épisode demandé.
 */

import {
  getPlaybackPosition,
  getPlaybackPositionByMediaRecord,
  watchedEpisodeKey,
} from './torrent-storage';
import { getEpisodeProgressMap } from '../watchedEpisodes';
import { getMovieWatchEntry } from '../watchedMovies';
import { serverApi } from '../client/server-api';

/** Au-delà (en % de la durée), le média est considéré comme terminé → reprise depuis le début. */
export const RESUME_RESTART_PERCENT = 95;
/** En-deçà, pas de reprise (simple ouverture / générique de début). */
export const MIN_RESUME_SECONDS = 5;

export interface ResumeQuery {
  torrentId?: string | null;
  tmdbId?: number | null;
  tmdbType?: string | null;
  season?: number | null;
  episode?: number | null;
  deviceId: string;
  /** Position explicite (ex. ?t= depuis « Continuer »). Prioritaire si valide. */
  preferredSeconds?: number | null;
  /** Durée connue du média (sinon déduite des sources). */
  durationSeconds?: number | null;
}

interface Candidate {
  pos: number;
  dur?: number | null;
  /** Horodatage ms de la sauvegarde (0 = inconnu). */
  t: number;
  source: string;
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Applique les règles : < MIN → null ; ≥ 95 % de la durée → null (on repart du début). */
export function finalizeResumeSeconds(
  positionSeconds: number | null | undefined,
  durationSeconds?: number | null,
): number | null {
  if (!isPos(positionSeconds) || positionSeconds < MIN_RESUME_SECONDS) return null;
  if (isPos(durationSeconds) && (positionSeconds / durationSeconds) * 100 >= RESUME_RESTART_PERCENT) {
    return null;
  }
  return positionSeconds;
}

type ServerResumeRow = {
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  season?: number | null;
  episode?: number | null;
  position_seconds?: number | null;
  duration_seconds?: number | null;
  progress?: number | null;
  last_watched?: number | null;
};

let serverCache: { at: number; rows: ServerResumeRow[] } | null = null;
let serverInflight: Promise<ServerResumeRow[]> | null = null;
const SERVER_CACHE_MS = 15_000;

async function listServerResume(): Promise<ServerResumeRow[]> {
  const now = Date.now();
  if (serverCache && now - serverCache.at < SERVER_CACHE_MS) return serverCache.rows;
  if (serverInflight) return serverInflight;
  serverInflight = (async () => {
    try {
      const res = await serverApi.listResumeWatching({ limit: 50 });
      const rows = res?.success && Array.isArray(res.data) ? (res.data as ServerResumeRow[]) : [];
      serverCache = { at: Date.now(), rows };
      return rows;
    } catch {
      return serverCache?.rows ?? [];
    } finally {
      serverInflight = null;
    }
  })();
  return serverInflight;
}

/** Invalide le cache serveur (après une sauvegarde locale par ex.). */
export function invalidateServerResumeCache(): void {
  serverCache = null;
}

/** Délai max d'attente de l'API avant de se contenter des sources locales. */
const SERVER_TIMEOUT_MS = 1500;

/**
 * Position de reprise en secondes, ou null pour démarrer au début
 * (rien de sauvegardé, ou visionnage ≥ 95 %).
 */
export async function resolveResumeSeconds(q: ResumeQuery): Promise<number | null> {
  const tmdbId = typeof q.tmdbId === 'number' && q.tmdbId > 0 ? q.tmdbId : null;
  const type = q.tmdbType === 'tv' ? 'tv' : q.tmdbType === 'movie' ? 'movie' : null;
  const season = typeof q.season === 'number' ? q.season : null;
  const episode = typeof q.episode === 'number' ? q.episode : null;
  const episodeKnown = type === 'tv' && season != null && episode != null && episode > 0;
  const candidates: Candidate[] = [];
  if (isPos(q.preferredSeconds)) {
    // ?t= vient de l'URL (chargement de la page) : une sauvegarde plus récente (lecture
    // poursuivie depuis, dans cette même page) doit l'emporter.
    const pageLoadedAt =
      typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)
        ? performance.timeOrigin
        : Date.now();
    candidates.push({ pos: q.preferredSeconds, t: pageLoadedAt, source: 'explicit' });
  }

  if (tmdbId != null && type === 'movie') {
    const e = getMovieWatchEntry(tmdbId);
    if (e && isPos(e.pos)) candidates.push({ pos: e.pos, dur: e.dur, t: e.t || 0, source: 'watched-movies' });
  }
  if (tmdbId != null && episodeKnown) {
    const e = getEpisodeProgressMap(tmdbId)[watchedEpisodeKey(season as number, episode as number)];
    if (e && isPos(e.pos)) candidates.push({ pos: e.pos, dur: e.dur, t: e.t || 0, source: 'episode-progress' });
  }
  if (tmdbId != null && type) {
    const rec = await getPlaybackPositionByMediaRecord(tmdbId, type, q.deviceId);
    // Série : la clé média est commune à toute la série → n'accepter que le bon épisode.
    const sameEpisode =
      type === 'movie' ||
      !episodeKnown ||
      (rec?.season === season && rec?.episode === episode);
    if (rec && isPos(rec.position) && sameEpisode) {
      candidates.push({ pos: rec.position, t: rec.timestamp || 0, source: 'media-key' });
    }
  }
  if (q.torrentId && (type !== 'tv' || !episodeKnown)) {
    const byTorrent = await getPlaybackPosition(q.torrentId, q.deviceId);
    if (isPos(byTorrent)) candidates.push({ pos: byTorrent, t: 0, source: 'torrent-key' });
  }
  if (tmdbId != null && type) {
    const rows = await Promise.race([
      listServerResume(),
      new Promise<ServerResumeRow[]>((r) => setTimeout(() => r([]), SERVER_TIMEOUT_MS)),
    ]);
    const row = rows.find(
      (r) =>
        r.tmdb_id === tmdbId &&
        (r.tmdb_type === 'tv' ? 'tv' : 'movie') === type &&
        (!episodeKnown || (r.season === season && r.episode === episode)),
    );
    if (row) {
      let pos = isPos(row.position_seconds) ? row.position_seconds : null;
      if (pos == null && isPos(row.progress) && isPos(row.duration_seconds)) {
        pos = (row.progress / 100) * row.duration_seconds;
      }
      if (pos != null) {
        candidates.push({ pos, dur: row.duration_seconds, t: row.last_watched || 0, source: 'server' });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.t - a.t || b.pos - a.pos);
  const best = candidates[0];
  const dur =
    (isPos(q.durationSeconds) ? q.durationSeconds : null) ??
    (isPos(best.dur) ? best.dur : null) ??
    candidates.map((c) => c.dur).find(isPos) ??
    null;
  return finalizeResumeSeconds(best.pos, dur);
}
