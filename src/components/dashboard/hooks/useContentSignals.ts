import { useEffect, useMemo, useState } from 'preact/hooks';
import { clientApi } from '../../../lib/client/api';
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

function parseSeasonEpisode(name: string): { season: number; episode: number } | null {
  if (!name) return null;
  const m =
    name.match(/s([0-9]{1,2})[.\s-]*e([0-9]{1,3})/i) ||
    name.match(/([0-9]{1,2})x([0-9]{1,3})/i) ||
    name.match(/season[.\s-]*([0-9]{1,2})[.\s-]*episode[.\s-]*([0-9]{1,3})/i);
  if (!m) return null;
  return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
}

export function useContentSignals(items: ContentItem[], resumeWatching: ResumeLike[]) {
  const [signalsByKey, setSignalsByKey] = useState<Record<string, SignalFlags>>({});

  useEffect(() => {
    let cancelled = false;

    const keyForTmdb = (tmdbId: number, type: 'movie' | 'tv') => `${type}:${tmdbId}`;
    const isAfter = (a: { season: number; episode: number }, b: { season: number; episode: number }) =>
      a.season > b.season || (a.season === b.season && a.episode > b.episode);

    const run = async () => {
      const next: Record<string, SignalFlags> = {};
      const withTmdb = items.filter((item) => typeof item.tmdbId === 'number' && (item.type === 'movie' || item.type === 'tv'));
      if (withTmdb.length === 0) {
        if (!cancelled) setSignalsByKey({});
        return;
      }

      // Demandes approuvées déjà téléchargées.
      try {
        const reqRes = await serverApi.listMediaRequests({ limit: 200 });
        if (reqRes.success && Array.isArray(reqRes.data)) {
          const approved = reqRes.data.filter((r) => r.status === 2);
          await Promise.all(
            approved.map(async (req) => {
              const type = req.media_type === 'movie' ? 'movie' : req.media_type === 'tv' ? 'tv' : null;
              if (!type || !req.tmdb_id) return;
              const local = await clientApi.findLocalMediaByTmdb(req.tmdb_id, type).catch(() => []);
              if (Array.isArray(local) && local.length > 0) {
                const key = keyForTmdb(req.tmdb_id, type);
                next[key] = { ...(next[key] ?? {}), requestDownloaded: true };
              }
            })
          );
        }
      } catch {
        // ignore
      }

      await Promise.all(
        withTmdb.map(async (item) => {
          const tmdbId = item.tmdbId as number;
          const key = keyForTmdb(tmdbId, item.type);
          const resume = resumeWatching.find((r) => r.tmdbId === tmdbId && r.type === item.type);

          if (item.type === 'movie') {
            const local = await clientApi.findLocalMediaByTmdb(tmdbId, 'movie').catch(() => []);
            const hasLocal = Array.isArray(local) && local.length > 0;
            const hasStarted = typeof resume?.progress === 'number' && resume.progress > 0;
            if (hasLocal && !hasStarted) {
              next[key] = { ...(next[key] ?? {}), downloadedUnseen: true };
            }
            return;
          }

          const local = await clientApi.findLocalMediaByTmdb(tmdbId, 'tv').catch(() => []);
          const highestDownloaded = (Array.isArray(local) ? local : [])
            .map((m: any) => {
              const season = m.season ?? m.season_number ?? m.seasonNumber;
              const episode = m.episode ?? m.episode_number ?? m.episodeNumber;
              if (typeof season === 'number' && typeof episode === 'number') return { season, episode };
              return parseSeasonEpisode(m.file_name || m.file_path || m.name || '');
            })
            .filter((x: any): x is { season: number; episode: number } => !!x)
            .sort((a, b) => (a.season - b.season) || (a.episode - b.episode))
            .pop();

          const watchedAnchor =
            typeof resume?.currentSeason === 'number' && typeof resume?.currentEpisode === 'number'
              ? { season: resume.currentSeason, episode: resume.currentEpisode }
              : null;

          if (highestDownloaded && (!watchedAnchor || isAfter(highestDownloaded, watchedAnchor))) {
            next[key] = { ...(next[key] ?? {}), downloadedUnseen: true };
          }

          const eps = await serverApi.getSeriesEpisodesByTmdbId(tmdbId).catch(() => ({ success: false } as any));
          if (!eps?.success || !eps.data?.seasons) return;
          const highestAvailable = eps.data.seasons
            .flatMap((s: any) => s.episodes ?? [])
            .filter((ep: any) => typeof ep?.episode === 'number' && ep.episode > 0)
            .map((ep: any) => ({ season: ep.season, episode: ep.episode }))
            .sort((a: any, b: any) => (a.season - b.season) || (a.episode - b.episode))
            .pop();
          if (!highestAvailable) return;

          const comparisonBase = highestDownloaded ?? watchedAnchor;
          if (comparisonBase && isAfter(highestAvailable, comparisonBase)) {
            next[key] = { ...(next[key] ?? {}), newEpisode: true };
          }
        })
      );

      if (!cancelled) setSignalsByKey(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [items, resumeWatching]);

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

