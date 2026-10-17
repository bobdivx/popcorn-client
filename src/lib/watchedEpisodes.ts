/**
 * Épisodes vus + progression par épisode (séries).
 *
 * - Source locale : localStorage (`watched_episodes_tmdb_<id>` + `episode_progress_tmdb_<id>`),
 *   lue par les carrousels d’épisodes (EpisodesArea) et rafraîchie via WATCHED_EPISODES_EVENT.
 * - Source serveur : `/api/watched-episodes` (par utilisateur), alimentée aussi côté serveur par
 *   chaque sauvegarde « Reprendre la lecture » → partagée web / webOS lite + natif / Android / desktop.
 * - Rattrapage : les épisodes vus stockés uniquement sur l’appareil sont poussés au serveur
 *   (une fois par série et par session).
 */
import { serverApi } from './client/server-api';
import {
  getWatchedEpisodesSet,
  markEpisodeWatched,
  replaceWatchedEpisodesSet,
  watchedEpisodeKey,
} from './streaming/torrent-storage';

/** Seuil « vu » (générique inclus), aligné serveur + REWATCH_PROGRESS_THRESHOLD. */
export const WATCHED_EPISODE_THRESHOLD_PERCENT = 90;
export const WATCHED_EPISODES_EVENT = 'popcorn-watched-episodes-changed';
const PROGRESS_PREFIX = 'episode_progress_tmdb_';
/** En-dessous : pas de « reprendre » (simple ouverture). */
const MIN_RESUME_PERCENT = 2;

export interface EpisodeProgressEntry {
  /** Progression 0–100. */
  p: number;
  pos?: number;
  dur?: number;
  /** Horodatage ms de la dernière mise à jour. */
  t: number;
}

export interface ServerWatchedEpisode {
  tmdb_id: number;
  season: number;
  episode: number;
  progress: number;
  position_seconds?: number | null;
  duration_seconds?: number | null;
  watched: boolean;
  updated_at: number;
}

type BackendAccess = {
  backendRequest<T>(
    endpoint: string,
    options?: RequestInit,
  ): Promise<{ success: boolean; data?: T; error?: string }>;
  getCurrentUserId?(): string | null;
};

function api(): BackendAccess {
  return serverApi as unknown as BackendAccess;
}

function userHeaders(): Record<string, string> {
  const a = api();
  const userId = a.getCurrentUserId?.() ?? null;
  return userId ? { 'X-User-ID': userId } : {};
}

function validIds(tmdbId: unknown, season: unknown, episode: unknown): boolean {
  return (
    typeof tmdbId === 'number' &&
    Number.isFinite(tmdbId) &&
    tmdbId > 0 &&
    typeof season === 'number' &&
    Number.isFinite(season) &&
    season >= 0 &&
    typeof episode === 'number' &&
    Number.isFinite(episode) &&
    episode > 0
  );
}

function readProgress(tmdbId: number): Record<string, EpisodeProgressEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${PROGRESS_PREFIX}${tmdbId}`);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? (obj as Record<string, EpisodeProgressEntry>) : {};
  } catch {
    return {};
  }
}

function writeProgress(tmdbId: number, map: Record<string, EpisodeProgressEntry>): void {
  try {
    localStorage.setItem(`${PROGRESS_PREFIX}${tmdbId}`, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function emit(tmdbId: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WATCHED_EPISODES_EVENT, { detail: { tmdbId } }));
}

/** Progression par épisode (clé `season:episode`) pour une série. */
export function getEpisodeProgressMap(tmdbId: number): Record<string, EpisodeProgressEntry> {
  return readProgress(tmdbId);
}

/** % de reprise affichable pour un épisode (null si rien / déjà vu). */
export function getEpisodeResumePercent(
  map: Record<string, EpisodeProgressEntry> | undefined,
  watchedSet: Set<string> | undefined,
  season: number,
  episode: number,
): number | null {
  if (!map || episode <= 0) return null;
  const k = watchedEpisodeKey(season, episode);
  if (watchedSet?.has(k)) return null;
  const e = map[k];
  if (!e || !Number.isFinite(e.p)) return null;
  if (e.p < MIN_RESUME_PERCENT || e.p >= WATCHED_EPISODE_THRESHOLD_PERCENT) return null;
  return Math.round(e.p);
}

export async function pushWatchedEpisode(payload: {
  tmdb_id: number;
  season: number;
  episode: number;
  progress?: number;
  position_seconds?: number | null;
  duration_seconds?: number | null;
  watched?: boolean;
}): Promise<void> {
  try {
    await api().backendRequest('/api/watched-episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify(payload),
    });
  } catch {
    /* hors-ligne / ancien serveur : la sauvegarde « reprendre » sert de filet */
  }
}

/**
 * Enregistre la progression d’un épisode (tous lecteurs : hls.js, HLS natif TV, direct).
 * Marque « vu » à ≥ 90 % (ou `forceWatched`, ex. fin de lecture / épisode suivant).
 */
export function recordEpisodeProgress(
  tmdbId: number | null | undefined,
  season: number | null | undefined,
  episode: number | null | undefined,
  positionSeconds: number,
  durationSeconds: number,
  opts: { forceWatched?: boolean; pushToServer?: boolean } = {},
): void {
  if (typeof window === 'undefined') return;
  if (!validIds(tmdbId, season, episode)) return;
  const id = tmdbId as number;
  const s = season as number;
  const e = episode as number;
  const dur = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const pos = Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : 0;
  let pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
  if (opts.forceWatched) pct = Math.max(pct, 100);
  // Pas d’écriture pour une simple ouverture (évite d’écraser une reprise par 0 %).
  if (pct <= 0 && !opts.forceWatched) return;
  const watched = !!opts.forceWatched || pct >= WATCHED_EPISODE_THRESHOLD_PERCENT;
  const map = readProgress(id);
  map[watchedEpisodeKey(s, e)] = {
    p: Math.round(pct * 10) / 10,
    ...(pos > 0 ? { pos: Math.round(pos) } : {}),
    ...(dur > 0 ? { dur: Math.round(dur) } : {}),
    t: Date.now(),
  };
  writeProgress(id, map);
  if (watched) markEpisodeWatched(id, s, e);
  emit(id);
  if (opts.pushToServer) {
    void pushWatchedEpisode({
      tmdb_id: id,
      season: s,
      episode: e,
      progress: pct,
      position_seconds: pos > 0 ? pos : null,
      duration_seconds: dur > 0 ? dur : null,
      ...(watched ? { watched: true } : {}),
    });
  }
}

const backfilledThisSession = new Set<number>();
const inflight = new Map<number, Promise<void>>();

/**
 * Fusionne les épisodes vus / progression du serveur dans le stockage local, puis pousse au
 * serveur les épisodes vus connus uniquement localement (rattrapage).
 */
export function syncWatchedEpisodesFromServer(tmdbId: number | null | undefined): Promise<void> {
  if (typeof window === 'undefined' || typeof tmdbId !== 'number' || !(tmdbId > 0)) {
    return Promise.resolve();
  }
  const existing = inflight.get(tmdbId);
  if (existing) return existing;
  const p = (async () => {
    let rows: ServerWatchedEpisode[] = [];
    try {
      const res = await api().backendRequest<ServerWatchedEpisode[]>(
        `/api/watched-episodes?tmdb_id=${encodeURIComponent(String(tmdbId))}`,
        { method: 'GET', headers: userHeaders() },
      );
      if (!res?.success || !Array.isArray(res.data)) return;
      rows = res.data;
    } catch {
      return;
    }
    const set = getWatchedEpisodesSet(tmdbId);
    const map = readProgress(tmdbId);
    const serverWatched = new Set<string>();
    let changed = false;
    for (const r of rows) {
      if (!validIds(tmdbId, r.season, r.episode)) continue;
      const k = watchedEpisodeKey(r.season, r.episode);
      if (r.watched) {
        serverWatched.add(k);
        if (!set.has(k)) {
          set.add(k);
          changed = true;
        }
      }
      const serverT = (Number(r.updated_at) || 0) * 1000;
      const local = map[k];
      if (!local || serverT > local.t) {
        const pr = Number(r.progress) || 0;
        map[k] = {
          p: pr,
          ...(r.position_seconds ? { pos: Math.round(r.position_seconds) } : {}),
          ...(r.duration_seconds ? { dur: Math.round(r.duration_seconds) } : {}),
          t: serverT || Date.now(),
        };
        changed = true;
      }
    }
    if (changed) {
      replaceWatchedEpisodesSet(tmdbId, set);
      writeProgress(tmdbId, map);
      emit(tmdbId);
    }
    if (!backfilledThisSession.has(tmdbId)) {
      backfilledThisSession.add(tmdbId);
      const missing = [...set].filter((k) => !serverWatched.has(k));
      if (missing.length > 0) {
        const items = missing
          .map((k) => {
            const [s, e] = k.split(':').map((x) => Number(x));
            const entry = map[k];
            return validIds(tmdbId, s, e)
              ? {
                  tmdb_id: tmdbId,
                  season: s,
                  episode: e,
                  progress: 100,
                  position_seconds: entry?.pos ?? null,
                  duration_seconds: entry?.dur ?? null,
                  watched: true,
                }
              : null;
          })
          .filter(Boolean);
        try {
          await api().backendRequest('/api/watched-episodes/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...userHeaders() },
            body: JSON.stringify({ items }),
          });
        } catch {
          /* réessai à la prochaine session */
        }
      }
    }
  })().finally(() => {
    inflight.delete(tmdbId);
  });
  inflight.set(tmdbId, p);
  return p;
}
