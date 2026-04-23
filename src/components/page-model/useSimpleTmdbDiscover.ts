import { useEffect, useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { ApiResponse } from '../../lib/client/server-api';
import type { TmdbItem } from './tmdb-mapper';

const CACHE_TTL_MS = 5 * 60 * 1000;

type DiscoverKind = 'movie' | 'tv';

export interface DiscoverSectionQuery {
  id: string;
  kind: DiscoverKind;
  params: Record<string, unknown>;
}

interface CacheEntry {
  expiresAt: number;
  value: TmdbItem[];
}

const discoverCache = new Map<string, CacheEntry>();
const inflightCache = new Map<string, Promise<TmdbItem[]>>();

function getLang(language: string): string {
  return language === 'fr' ? 'fr-FR' : 'en-US';
}

function makeKey(kind: DiscoverKind, language: string, params: Record<string, unknown>): string {
  const normalized = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return `${kind}:${language}:${JSON.stringify(normalized)}`;
}

async function fetchDiscover(kind: DiscoverKind, language: string, params: Record<string, unknown>): Promise<TmdbItem[]> {
  const key = makeKey(kind, language, params);
  const now = Date.now();
  const cached = discoverCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = inflightCache.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    const withLang = { page: 1, language, ...params };
    const response: ApiResponse<{ results?: TmdbItem[] }> =
      kind === 'movie'
        ? await serverApi.discoverMovies(withLang as any)
        : await serverApi.discoverTv(withLang as any);

    const results = response.success && response.data?.results ? response.data.results : [];
    discoverCache.set(key, { value: results, expiresAt: Date.now() + CACHE_TTL_MS });
    return results;
  })();

  inflightCache.set(key, request);
  try {
    return await request;
  } finally {
    inflightCache.delete(key);
  }
}

export function useSimpleTmdbDiscover(sections: DiscoverSectionQuery[], language: string) {
  const [itemsById, setItemsById] = useState<Record<string, TmdbItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lang = getLang(language);
  const sectionsKey = useMemo(() => JSON.stringify(sections), [sections]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const entries = await Promise.all(
          sections.map(async (section) => {
            const items = await fetchDiscover(section.kind, lang, section.params);
            return [section.id, items] as const;
          })
        );
        setItemsById(Object.fromEntries(entries));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [lang, sectionsKey]);

  return { itemsById, loading, error };
}
