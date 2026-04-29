import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';
import { RESUME_WATCHING_EVENT } from '../../../lib/resumeWatchingStorage';
import { serverApi } from '../../../lib/client/server-api';

const STORAGE_KEY = 'resumeWatching';
const REWATCH_PROGRESS_THRESHOLD = 99;
const TMDB_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Statut calculé d'un item "Reprendre" :
 * - in_progress : épisode/film en cours (progress < 99%).
 * - new_episode_available : série finie sur l'épisode courant et un nouvel épisode est dispo TMDB.
 * - waiting_for_next : série finie, pas d'épisode dispo encore mais un est annoncé (date connue).
 * - finished : terminé sans suite (film ou série Ended sur le dernier épisode).
 */
export type ResumeStatus = 'in_progress' | 'new_episode_available' | 'waiting_for_next' | 'finished';

export interface EnrichedResumeItem extends ContentItem {
  resumeStatus: ResumeStatus;
  /** Saison de l'épisode en cours (séries). */
  currentSeason?: number;
  /** Épisode en cours (séries). */
  currentEpisode?: number;
  /** ID de variante (pour pré-sélection lecteur). */
  variantId?: string;
  /** Position en secondes (reprise précise). */
  positionSeconds?: number;
  /** Durée en secondes. */
  durationSeconds?: number;
  /** Saison/épisode du prochain épisode à regarder (si new_episode_available). */
  nextSeason?: number;
  nextEpisode?: number;
  /** Date ISO de diffusion du prochain épisode (si waiting_for_next). */
  nextEpisodeAirDate?: string;
  /** Timestamp pour le tri. */
  lastWatched?: number;
}

interface StoredItem extends ContentItem {
  lastWatched: number;
  season?: number;
  episode?: number;
  variantId?: string;
  positionSeconds?: number;
  durationSeconds?: number;
}

interface TmdbTvData {
  status?: string;
  last_episode_to_air?: { season_number?: number; episode_number?: number; air_date?: string } | null;
  next_episode_to_air?: { season_number?: number; episode_number?: number; air_date?: string } | null;
}

interface TmdbCacheEntry {
  data: TmdbTvData;
  expires: number;
}

/** Cache TMDB partagé entre toutes les instances du hook (vit le temps de la session). */
const tmdbCache = new Map<number, TmdbCacheEntry>();
const tmdbInflight = new Map<number, Promise<TmdbTvData | null>>();

async function getTmdbTv(tmdbId: number): Promise<TmdbTvData | null> {
  const now = Date.now();
  const cached = tmdbCache.get(tmdbId);
  if (cached && cached.expires > now) return cached.data;

  const inflight = tmdbInflight.get(tmdbId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await serverApi.getTmdbTvDetail(tmdbId);
      if (res?.success && res.data) {
        const data = res.data as TmdbTvData;
        tmdbCache.set(tmdbId, { data, expires: now + TMDB_CACHE_TTL_MS });
        return data;
      }
    } catch {
      // ignore : on retombera sur in_progress
    }
    return null;
  })();

  tmdbInflight.set(tmdbId, promise);
  try {
    return await promise;
  } finally {
    tmdbInflight.delete(tmdbId);
  }
}

function readStoredItems(): StoredItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    // Migration silencieuse depuis l'ancien stockage sessionStorage.
    if (!stored && typeof sessionStorage !== 'undefined') {
      const legacy = sessionStorage.getItem(STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        sessionStorage.removeItem(STORAGE_KEY);
        stored = legacy;
      }
    }
    if (!stored) return [];
    const data: StoredItem[] = JSON.parse(stored);
    return data.slice().sort((a, b) => b.lastWatched - a.lastWatched);
  } catch {
    return [];
  }
}

/**
 * Calcule le statut d'un item TV à partir de la position courante + données TMDB.
 */
function computeTvStatus(
  item: StoredItem,
  tmdb: TmdbTvData | null,
): {
  resumeStatus: ResumeStatus;
  nextSeason?: number;
  nextEpisode?: number;
  nextEpisodeAirDate?: string;
} {
  const progress = item.progress ?? 0;
  // Épisode encore en cours -> on continue cet épisode-là.
  if (progress < REWATCH_PROGRESS_THRESHOLD) {
    return { resumeStatus: 'in_progress' };
  }
  // Épisode terminé. Y a-t-il un suivant ?
  if (!tmdb) {
    return { resumeStatus: 'finished' };
  }
  const last = tmdb.last_episode_to_air;
  const next = tmdb.next_episode_to_air;
  const curSeason = item.season ?? 0;
  const curEpisode = item.episode ?? 0;

  // Si on a un last_episode_to_air et qu'on est avant lui -> nouvel épisode dispo.
  if (last) {
    const ls = last.season_number ?? 0;
    const le = last.episode_number ?? 0;
    if (ls > curSeason || (ls === curSeason && le > curEpisode)) {
      // L'épisode immédiatement suivant est forcément déjà sorti (puisqu'on est en retard sur last).
      return {
        resumeStatus: 'new_episode_available',
        // On ne connaît pas exactement le numéro suivant sans la grille -> on pointe vers le dernier dispo.
        nextSeason: ls,
        nextEpisode: le,
      };
    }
  }
  // On est à jour : prochain épisode prévu mais pas encore diffusé ?
  if (next && next.air_date) {
    return {
      resumeStatus: 'waiting_for_next',
      nextSeason: next.season_number,
      nextEpisode: next.episode_number,
      nextEpisodeAirDate: next.air_date,
    };
  }
  // Série Ended/Canceled et on a tout vu.
  return { resumeStatus: 'finished' };
}

export function useResumeWatching() {
  const [allItems, setAllItems] = useState<StoredItem[]>(() => readStoredItems());
  const [tmdbMap, setTmdbMap] = useState<Map<number, TmdbTvData | null>>(new Map());

  // Recharge depuis sessionStorage à la demande (mount + events).
  useEffect(() => {
    const refresh = () => setAllItems(readStoredItems());
    refresh();

    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(RESUME_WATCHING_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(RESUME_WATCHING_EVENT, refresh as EventListener);
    };
  }, []);

  // Pour chaque item TV avec tmdbId, fetch les méta TMDB (cache 1h).
  useEffect(() => {
    let cancelled = false;
    const tvIds = new Set<number>();
    for (const it of allItems) {
      if (it.type === 'tv' && typeof it.tmdbId === 'number') tvIds.add(it.tmdbId);
    }
    const toFetch = Array.from(tvIds).filter((id) => !tmdbMap.has(id));
    if (toFetch.length === 0) return;

    (async () => {
      const results = await Promise.all(
        toFetch.map(async (id) => [id, await getTmdbTv(id)] as const),
      );
      if (cancelled) return;
      setTmdbMap((prev) => {
        const next = new Map(prev);
        for (const [id, data] of results) next.set(id, data);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [allItems, tmdbMap]);

  return useMemo(() => {
    const resume: EnrichedResumeItem[] = [];
    const rewatch: EnrichedResumeItem[] = [];
    const waitingForNext: EnrichedResumeItem[] = [];
    const ids = new Set<string>();

    allItems.forEach(({ lastWatched, season, episode, variantId, positionSeconds, durationSeconds, ...item }) => {
      const progress = item.progress ?? 0;
      if (item.id) ids.add(item.id);
      if (item.tmdbId != null) ids.add(String(item.tmdbId));

      let statusInfo: ReturnType<typeof computeTvStatus>;
      if (item.type === 'tv') {
        const tmdb = item.tmdbId != null ? tmdbMap.get(item.tmdbId) ?? null : null;
        statusInfo = computeTvStatus(
          { ...item, season, episode, variantId, positionSeconds, durationSeconds, lastWatched },
          tmdb,
        );
      } else {
        statusInfo = {
          resumeStatus: progress >= REWATCH_PROGRESS_THRESHOLD ? 'finished' : 'in_progress',
        };
      }

      const enriched: EnrichedResumeItem = {
        ...item,
        currentSeason: season,
        currentEpisode: episode,
        variantId,
        positionSeconds,
        durationSeconds,
        lastWatched,
        ...statusInfo,
      };

      if (enriched.resumeStatus === 'waiting_for_next') {
        // Toujours dans la rangée Reprendre (avec badge), mais aussi listé séparément.
        resume.push(enriched);
        waitingForNext.push(enriched);
      } else if (enriched.resumeStatus === 'finished' && progress >= REWATCH_PROGRESS_THRESHOLD) {
        // Film/série complètement terminé sans suite -> ligne "Revoir".
        rewatch.push(enriched);
      } else {
        // in_progress | new_episode_available -> Reprendre.
        resume.push(enriched);
      }
    });

    return {
      resumeWatching: resume.slice(0, 15),
      rewatchWatching: rewatch.slice(0, 15),
      waitingForNext: waitingForNext.slice(0, 15),
      watchedIds: ids,
    };
  }, [allItems, tmdbMap]);
}
