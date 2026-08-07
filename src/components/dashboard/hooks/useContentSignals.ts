import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { ContentItem } from '../../../lib/client/types';

type SignalFlags = {
  newEpisode?: boolean;
  requestDownloaded?: boolean;
  downloadedUnseen?: boolean;
};

type ResumeLike = ContentItem & {
  currentSeason?: number;
  currentEpisode?: number;
};

type LocalEntry = {
  season?: number;
  episode?: number;
};

const SIGNALS_DEBOUNCE_MS = 280;
const EPISODE_FETCH_CONCURRENCY = 4;

function parseSeasonEpisode(name: string): { season: number; episode: number } | null {
  if (!name) return null;
  const m =
    name.match(/s([0-9]{1,2})[.\s-]*e([0-9]{1,3})/i) ||
    name.match(/([0-9]{1,2})x([0-9]{1,3})/i) ||
    name.match(/season[.\s-]*([0-9]{1,2})[.\s-]*episode[.\s-]*([0-9]{1,3})/i);
  if (!m) return null;
  return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
}

function keyForTmdb(tmdbId: number, type: 'movie' | 'tv') {
  return `${type}:${tmdbId}`;
}

function isAfter(
  a: { season: number; episode: number },
  b: { season: number; episode: number }
) {
  return a.season > b.season || (a.season === b.season && a.episode > b.episode);
}

function normalizeLibraryType(raw: unknown): 'movie' | 'tv' | null {
  const typ = String(raw ?? '').toLowerCase();
  if (!typ) return null;
  if (typ === 'tv' || typ === 'series' || typ.includes('serie')) return 'tv';
  if (typ === 'movie' || typ.includes('film')) return 'movie';
  return null;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await fn(current);
    }
  });
  await Promise.all(workers);
}

/**
 * Badges catalogue (à regarder / nouvel épisode / demande dispo).
 * Une lecture bibliothèque + requêtes épisodes limitées — pas de N+1 findLocalMediaByTmdb.
 */
export function useContentSignals(items: ContentItem[], resumeWatching: ResumeLike[]) {
  const [signalsByKey, setSignalsByKey] = useState<Record<string, SignalFlags>>({});
  const itemsRef = useRef(items);
  const resumeRef = useRef(resumeWatching);
  itemsRef.current = items;
  resumeRef.current = resumeWatching;

  const itemsKey = useMemo(
    () =>
      items
        .filter((item) => typeof item.tmdbId === 'number' && (item.type === 'movie' || item.type === 'tv'))
        .map((item) => `${item.type}:${item.tmdbId}`)
        .sort()
        .join('|'),
    [items]
  );

  const resumeKey = useMemo(
    () =>
      resumeWatching
        .filter((r) => typeof r.tmdbId === 'number')
        .map(
          (r) =>
            `${r.type}:${r.tmdbId}:${r.currentSeason ?? ''}:${r.currentEpisode ?? ''}:${r.progress ?? ''}`
        )
        .sort()
        .join('|'),
    [resumeWatching]
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void run();
    }, SIGNALS_DEBOUNCE_MS);

    const run = async () => {
      const currentItems = itemsRef.current;
      const currentResume = resumeRef.current;
      const next: Record<string, SignalFlags> = {};
      const withTmdb = currentItems.filter(
        (item) => typeof item.tmdbId === 'number' && (item.type === 'movie' || item.type === 'tv')
      );
      if (withTmdb.length === 0) {
        if (!cancelled) setSignalsByKey({});
        return;
      }

      // 1) Index bibliothèque en 1 appel (cache TTL 45s côté getLibrary) — évite findLocalMediaByTmdb × N
      const localByKey = new Map<string, LocalEntry[]>();
      try {
        const libRes = await serverApi.getLibrary();
        if (libRes.success && Array.isArray(libRes.data)) {
          for (const raw of libRes.data as Array<Record<string, unknown>>) {
            const tmdbId =
              typeof raw.tmdb_id === 'number'
                ? raw.tmdb_id
                : typeof raw.tmdbId === 'number'
                  ? raw.tmdbId
                  : null;
            const type = normalizeLibraryType(raw.tmdb_type ?? raw.tmdbType ?? raw.category);
            if (tmdbId == null || !type) continue;
            const key = keyForTmdb(tmdbId, type);
            const name = String(raw.name || raw.file_name || raw.download_path || '');
            const se = parseSeasonEpisode(name);
            const list = localByKey.get(key) ?? [];
            list.push({ season: se?.season, episode: se?.episode });
            localByKey.set(key, list);
          }
        }
      } catch {
        // ignore — badges locaux absents si bibliothèque indisponible
      }

      // 2) Demandes approuvées déjà en bibliothèque (même index)
      try {
        const reqRes = await serverApi.listMediaRequests({ limit: 200 });
        if (reqRes.success && Array.isArray(reqRes.data)) {
          for (const req of reqRes.data) {
            if (req.status !== 2 || !req.tmdb_id) continue;
            const type = req.media_type === 'movie' ? 'movie' : req.media_type === 'tv' ? 'tv' : null;
            if (!type) continue;
            const key = keyForTmdb(req.tmdb_id, type);
            if (localByKey.has(key)) {
              next[key] = { ...(next[key] ?? {}), requestDownloaded: true };
            }
          }
        }
      } catch {
        // ignore
      }

      // 3) downloadedUnseen — purement en mémoire
      const episodeCandidates: Array<{
        tmdbId: number;
        key: string;
        comparisonBase: { season: number; episode: number };
      }> = [];

      for (const item of withTmdb) {
        const tmdbId = item.tmdbId as number;
        const key = keyForTmdb(tmdbId, item.type);
        const locals = localByKey.get(key) ?? [];
        const hasLocal = locals.length > 0;
        const resume = currentResume.find((r) => r.tmdbId === tmdbId && r.type === item.type);

        if (item.type === 'movie') {
          const hasStarted = typeof resume?.progress === 'number' && resume.progress > 0;
          if (hasLocal && !hasStarted) {
            next[key] = { ...(next[key] ?? {}), downloadedUnseen: true };
          }
          continue;
        }

        const highestDownloaded = locals
          .filter(
            (x): x is { season: number; episode: number } =>
              typeof x.season === 'number' && typeof x.episode === 'number'
          )
          .sort((a, b) => a.season - b.season || a.episode - b.episode)
          .pop();

        const watchedAnchor =
          typeof resume?.currentSeason === 'number' && typeof resume?.currentEpisode === 'number'
            ? { season: resume.currentSeason, episode: resume.currentEpisode }
            : null;

        if (highestDownloaded && (!watchedAnchor || isAfter(highestDownloaded, watchedAnchor))) {
          next[key] = { ...(next[key] ?? {}), downloadedUnseen: true };
        }

        // newEpisode : seulement si on a une ancre (local ou reprise) — évite N appels épisodes
        const comparisonBase = highestDownloaded ?? watchedAnchor;
        if (comparisonBase) {
          episodeCandidates.push({ tmdbId, key, comparisonBase });
        }
      }

      // 4) Épisodes sync — concurrence limitée, candidats uniquement
      await mapPool(episodeCandidates, EPISODE_FETCH_CONCURRENCY, async ({ tmdbId, key, comparisonBase }) => {
        if (cancelled) return;
        try {
          const eps = await serverApi.getSeriesEpisodesByTmdbId(tmdbId);
          if (!eps?.success || !eps.data?.seasons) return;
          const highestAvailable = eps.data.seasons
            .flatMap((s) => s.episodes ?? [])
            .filter((ep) => typeof ep?.episode === 'number' && ep.episode > 0)
            .map((ep) => ({ season: ep.season, episode: ep.episode }))
            .sort((a, b) => a.season - b.season || a.episode - b.episode)
            .pop();
          if (!highestAvailable) return;
          if (isAfter(highestAvailable, comparisonBase)) {
            next[key] = { ...(next[key] ?? {}), newEpisode: true };
          }
        } catch {
          // ignore
        }
      });

      if (!cancelled) setSignalsByKey(next);
    };

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [itemsKey, resumeKey]);

  const withSignals = useMemo(
    () =>
      items.map((item) => {
        const key =
          typeof item.tmdbId === 'number' && (item.type === 'movie' || item.type === 'tv')
            ? `${item.type}:${item.tmdbId}`
            : null;
        const signal = key ? signalsByKey[key] : undefined;
        return signal ? { ...item, heroSignal: signal } : item;
      }),
    [items, signalsByKey]
  );

  return { signalsByKey, withSignals };
}
