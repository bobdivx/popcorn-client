import { useEffect, useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n/useI18n';
import {
  keepHighlight,
  tmdbToSuggestion,
  type HighlightList,
  type RawTmdbItem,
  type SuggestionItem,
} from '../utils/highlights';

/** Le serveur met déjà en cache 6 h ; ici on évite juste de refaire les appels à chaque page. */
const CACHE_TTL_MS = 30 * 60 * 1000;
const PAGES = [1, 2];

const cache = new Map<string, { at: number; items: SuggestionItem[] }>();
const inflight = new Map<string, Promise<SuggestionItem[]>>();

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

/** Repli pour un serveur qui n'a pas encore /api/discover/highlights : discover TMDB avec fenêtre de dates. */
async function fetchFallback(list: HighlightList, lang: string, page: number): Promise<RawTmdbItem[]> {
  const movie = (p: Record<string, unknown>) => serverApi.discoverMovies({ page, language: lang, sort_by: 'popularity.desc', ...p } as any);
  const tv = (p: Record<string, unknown>) => serverApi.discoverTv({ page, language: lang, sort_by: 'popularity.desc', ...p } as any);
  let res;
  switch (list) {
    case 'now_playing':
      res = await movie({ primary_release_date_gte: isoDay(-90), primary_release_date_lte: isoDay(7), vote_count_gte: 5 });
      break;
    case 'upcoming':
      res = await movie({ primary_release_date_gte: isoDay(1), primary_release_date_lte: isoDay(90) });
      break;
    case 'trending_movie':
      res = await movie({ primary_release_date_gte: isoDay(-365), primary_release_date_lte: isoDay(0), vote_count_gte: 50 });
      break;
    case 'trending_tv':
    case 'on_the_air':
    case 'airing_today':
      res = await tv({ first_air_date_gte: isoDay(-730), first_air_date_lte: isoDay(0), vote_count_gte: 20 });
      break;
    default:
      return [];
  }
  return res?.success && Array.isArray(res.data?.results) ? (res.data!.results as RawTmdbItem[]) : [];
}

async function fetchPage(list: HighlightList, lang: string, region: string, page: number): Promise<RawTmdbItem[]> {
  try {
    const res = await serverApi.discoverHighlights(list, { page, language: lang, region });
    if (res?.success && Array.isArray(res.data?.results)) return res.data!.results as RawTmdbItem[];
  } catch {
    /* repli ci-dessous */
  }
  try {
    return await fetchFallback(list, lang, page);
  } catch {
    return [];
  }
}

async function loadList(list: HighlightList, lang: string, region: string): Promise<SuggestionItem[]> {
  const key = `${list}:${lang}:${region}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const pages = await Promise.all(PAGES.map((page) => fetchPage(list, lang, region, page)));
    const seen = new Set<string>();
    const items: SuggestionItem[] = [];
    const now = Date.now();
    for (const raw of pages.flat()) {
      if (!keepHighlight(list, raw, now)) continue;
      const item = tmdbToSuggestion(list, raw);
      if (!item) continue;
      const k = `${item.type}:${item.tmdbId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(item);
    }
    if (items.length > 0) cache.set(key, { at: Date.now(), items });
    return items;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Listes TMDB « du moment » (région FR, langue de l'UI), filtrées (fenêtre de dates,
 * seuils de votes) et dédoublonnées. Les erreurs donnent des listes vides (rangées masquées).
 */
export function useTmdbHighlights(lists: HighlightList[]): Partial<Record<HighlightList, SuggestionItem[]>> {
  const { language } = useI18n();
  const lang = language === 'en' ? 'en-US' : 'fr-FR';
  const region = 'FR';
  const listsKey = lists.join(',');
  const [byList, setByList] = useState<Partial<Record<HighlightList, SuggestionItem[]>>>({});

  useEffect(() => {
    let cancelled = false;
    const wanted = listsKey.split(',').filter(Boolean) as HighlightList[];
    Promise.all(wanted.map(async (l) => [l, await loadList(l, lang, region)] as const))
      .then((entries) => {
        if (!cancelled) setByList(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setByList({});
      });
    return () => {
      cancelled = true;
    };
  }, [listsKey, lang]);

  return useMemo(() => byList, [byList]);
}
