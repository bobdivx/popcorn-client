/**
 * Films vus + progression par film (toutes plateformes).
 *
 * - Cache local (localStorage `watched_movies_v1`) → affichage immédiat (cartes, détail).
 * - Serveur `/api/watched-movies` (par utilisateur) : alimenté aussi par chaque sauvegarde
 *   « Reprendre » côté serveur (rattrapage des anciennes entrées inclus).
 * - Store partagé : une carte ne se re-rend que si l'état de SON film change.
 */
import { useEffect, useState } from 'preact/hooks';
import { serverApi } from './client/server-api';

export const WATCHED_MOVIE_THRESHOLD_PERCENT = 90;
/** Générique de fin : considéré « vu » s'il reste moins que ça (films ≥ 45 min). */
export const MOVIE_CREDITS_SECONDS = 300;
const MIN_RESUME_PERCENT = 2;
const STORAGE_KEY = 'watched_movies_v1';
export const WATCHED_MOVIES_EVENT = 'popcorn-watched-movies-changed';

export interface MovieWatchEntry {
  /** 0–100 */
  p: number;
  pos?: number;
  dur?: number;
  /** vu */
  w: boolean;
  /** ms */
  t: number;
}

export interface MovieWatchState {
  watched: boolean;
  /** % de reprise (null si non commencé ou vu). */
  resumePercent: number | null;
  positionSeconds: number | null;
}

interface ServerWatchedMovie {
  tmdb_id: number;
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
const api = () => serverApi as unknown as BackendAccess;
function userHeaders(): Record<string, string> {
  const id = api().getCurrentUserId?.() ?? null;
  return id ? { 'X-User-ID': id } : {};
}

let cache: Record<string, MovieWatchEntry> | null = null;
const subs = new Map<number, Set<() => void>>();

function load(): Record<string, MovieWatchEntry> {
  if (cache) return cache;
  cache = {};
  if (typeof window === 'undefined') return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (obj && typeof obj === 'object') cache = obj as Record<string, MovieWatchEntry>;
  } catch {
    /* corrompu */
  }
  return cache!;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    /* quota */
  }
}

function notify(ids: number[]): void {
  for (const id of ids) subs.get(id)?.forEach((fn) => fn());
  if (typeof window !== 'undefined' && ids.length) {
    window.dispatchEvent(new CustomEvent(WATCHED_MOVIES_EVENT, { detail: { tmdbIds: ids } }));
  }
}

function validId(id: unknown): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

export function getMovieWatchState(tmdbId: number | null | undefined): MovieWatchState {
  if (!validId(tmdbId)) return { watched: false, resumePercent: null, positionSeconds: null };
  const e = load()[String(tmdbId)];
  if (!e) return { watched: false, resumePercent: null, positionSeconds: null };
  const resume =
    !e.w && e.p >= MIN_RESUME_PERCENT && e.p < WATCHED_MOVIE_THRESHOLD_PERCENT ? Math.round(e.p) : null;
  return { watched: !!e.w, resumePercent: resume, positionSeconds: resume != null ? e.pos ?? null : null };
}

async function post(payload: Record<string, unknown>): Promise<void> {
  try {
    await api().backendRequest('/api/watched-movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify(payload),
    });
  } catch {
    /* hors-ligne : la reprise serveur sert de filet */
  }
}

/** Progression lecteur (tous lecteurs). « Vu » à ≥ 90 % ou générique atteint. */
export function recordMovieProgress(
  tmdbId: number | null | undefined,
  positionSeconds: number,
  durationSeconds: number,
  opts: { forceWatched?: boolean } = {},
): void {
  if (typeof window === 'undefined' || !validId(tmdbId)) return;
  const dur = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const pos = Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : 0;
  if (!dur) return;
  const pct = Math.min(100, Math.max(0, (pos / dur) * 100));
  if (pct <= 0 && !opts.forceWatched) return;
  const creditsReached = dur >= 45 * 60 && dur - pos <= MOVIE_CREDITS_SECONDS;
  const reached = !!opts.forceWatched || pct >= WATCHED_MOVIE_THRESHOLD_PERCENT || creditsReached;
  const map = load();
  const prev = map[String(tmdbId)];
  map[String(tmdbId)] = {
    p: Math.round(pct * 10) / 10,
    pos: Math.round(pos),
    dur: Math.round(dur),
    w: reached || !!prev?.w,
    t: Date.now(),
  };
  persist();
  if (!prev || prev.w !== map[String(tmdbId)].w || Math.abs((prev.p ?? 0) - pct) >= 1) notify([tmdbId]);
  // Générique atteint avant 90 % : le serveur ne le déduirait pas de la reprise → explicite.
  if (reached && !prev?.w) {
    void post({ tmdb_id: tmdbId, progress: pct, position_seconds: pos, duration_seconds: dur, watched: true });
  }
}

/** Marquer vu / non vu (page détail). Non vu = efface la reprise affichée. */
export async function setMovieWatched(tmdbId: number | null | undefined, watched: boolean): Promise<void> {
  if (!validId(tmdbId)) return;
  const map = load();
  const prev = map[String(tmdbId)];
  map[String(tmdbId)] = watched
    ? { p: 100, pos: prev?.pos, dur: prev?.dur, w: true, t: Date.now() }
    : { p: 0, dur: prev?.dur, w: false, t: Date.now() };
  persist();
  notify([tmdbId]);
  await post({ tmdb_id: tmdbId, watched, ...(watched ? { progress: 100 } : {}) });
}

let syncPromise: Promise<void> | null = null;
let lastSync = 0;
const SYNC_TTL_MS = 5 * 60 * 1000;

/** Fusionne la liste serveur (une requête pour tous les films), puis pousse les vus locaux manquants. */
export function syncWatchedMovies(force = false): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (syncPromise) return syncPromise;
  if (!force && Date.now() - lastSync < SYNC_TTL_MS) return Promise.resolve();
  syncPromise = (async () => {
    let rows: ServerWatchedMovie[] = [];
    try {
      const res = await api().backendRequest<ServerWatchedMovie[]>('/api/watched-movies', {
        method: 'GET',
        headers: userHeaders(),
      });
      if (!res?.success || !Array.isArray(res.data)) return;
      rows = res.data;
    } catch {
      return;
    }
    lastSync = Date.now();
    const map = load();
    const changed: number[] = [];
    const onServer = new Set<number>();
    for (const r of rows) {
      if (!validId(r.tmdb_id)) continue;
      onServer.add(r.tmdb_id);
      const k = String(r.tmdb_id);
      const st = (Number(r.updated_at) || 0) * 1000;
      const local = map[k];
      if (!local || st >= local.t) {
        const next: MovieWatchEntry = {
          p: Number(r.progress) || 0,
          ...(r.position_seconds ? { pos: Math.round(r.position_seconds) } : {}),
          ...(r.duration_seconds ? { dur: Math.round(r.duration_seconds) } : {}),
          w: !!r.watched,
          t: st || Date.now(),
        };
        if (!local || local.w !== next.w || Math.round(local.p) !== Math.round(next.p)) changed.push(r.tmdb_id);
        map[k] = next;
      }
    }
    persist();
    if (changed.length) notify(changed);
    // Rattrapage : vus uniquement sur cet appareil.
    const missing = Object.entries(map)
      .filter(([k, e]) => e.w && !onServer.has(Number(k)))
      .slice(0, 200);
    for (const [k, e] of missing) {
      await post({ tmdb_id: Number(k), progress: 100, duration_seconds: e.dur ?? null, watched: true });
    }
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

/** Hook carte / détail : se ré-abonne seulement à SON film. */
export function useMovieWatchState(tmdbId: number | null | undefined, enabled = true): MovieWatchState {
  const id = enabled && validId(tmdbId) ? tmdbId : null;
  const [state, setState] = useState<MovieWatchState>(() => getMovieWatchState(id));
  useEffect(() => {
    if (id == null) {
      setState(getMovieWatchState(null));
      return;
    }
    const fn = () =>
      setState((prev) => {
        const next = getMovieWatchState(id);
        return prev.watched === next.watched &&
          prev.resumePercent === next.resumePercent &&
          prev.positionSeconds === next.positionSeconds
          ? prev
          : next;
      });
    let set = subs.get(id);
    if (!set) {
      set = new Set();
      subs.set(id, set);
    }
    set.add(fn);
    fn();
    void syncWatchedMovies();
    return () => {
      set!.delete(fn);
      if (set!.size === 0) subs.delete(id);
    };
  }, [id]);
  return state;
}
