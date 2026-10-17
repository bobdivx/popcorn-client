/**
 * Plateformes de streaming — helpers client (cache mémoire court, mapping vers ContentItem).
 * Le serveur met déjà en cache TMDB (6–24 h) ; ici on évite juste de refaire les appels
 * lors des allers-retours entre pages.
 */
import { serverApi } from './client/server-api';
import type { ContentItem } from './client/types';
import type {
  PlatformRowDef,
  PlatformTitle,
  StreamingPlatform,
  TitleWatchProviders,
} from './client/server-api/platforms';

export type { PlatformRowDef, PlatformTitle, StreamingPlatform, TitleWatchProviders };

const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T | null>;
  const p = (async () => {
    try {
      const value = await load();
      if (value != null) cache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      return null;
    }
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function tmdbLangFor(language: string): string {
  return language === 'en' ? 'en-US' : 'fr-FR';
}

/** Logo fournisseur TMDB (w92 par défaut, w154/w300 pour les grandes cartes). */
export function providerLogoUrl(logoPath: string | null | undefined, size: 'w45' | 'w92' | 'w154' | 'w300' | 'original' = 'w92'): string | null {
  if (!logoPath) return null;
  return `${TMDB_IMG}${size}${logoPath}`;
}

export function platformHref(slug: string): string {
  // Slash final : requis par certaines WebViews (Tauri) pour les routes « répertoire ».
  return `/plateformes/?p=${encodeURIComponent(slug)}`;
}

export function loadPlatforms(language: string): Promise<StreamingPlatform[] | null> {
  const lang = tmdbLangFor(language);
  return cached(`list:${lang}`, async () => {
    const res = await serverApi.listStreamingPlatforms(lang);
    return res?.success && Array.isArray(res.data?.platforms) ? res.data!.platforms : null;
  });
}

export function loadPlatform(
  slug: string,
  language: string
): Promise<{ platform: StreamingPlatform; rows: PlatformRowDef[] } | null> {
  const lang = tmdbLangFor(language);
  return cached(`meta:${slug}:${lang}`, async () => {
    const res = await serverApi.getStreamingPlatform(slug, lang);
    if (!res?.success || !res.data?.platform) return null;
    return { platform: res.data.platform, rows: Array.isArray(res.data.rows) ? res.data.rows : [] };
  });
}

export function loadPlatformRow(slug: string, row: PlatformRowDef, language: string): Promise<PlatformTitle[] | null> {
  const lang = tmdbLangFor(language);
  return cached(`row:${slug}:${row.id}:${lang}`, async () => {
    const res =
      row.kind === 'exclusives'
        ? await serverApi.getStreamingPlatformExclusives(slug, lang)
        : row.media_type && typeof row.genre === 'number'
          ? await serverApi.getStreamingPlatformRow(slug, row.media_type, row.genre, lang)
          : null;
    return res?.success && Array.isArray(res.data?.results) ? res.data!.results : null;
  });
}

export function loadTitleWatchProviders(mediaType: 'movie' | 'tv', tmdbId: number): Promise<TitleWatchProviders | null> {
  return cached(`wp:${mediaType}:${tmdbId}`, async () => {
    const res = await serverApi.getTitleWatchProviders(mediaType, tmdbId);
    return res?.success && res.data ? res.data : null;
  });
}

export type PlatformContentItem = ContentItem & {
  suggestionOnly?: boolean;
  exclusivity?: 'original' | 'exclusive' | null;
  inLibrary?: boolean;
};

/** Titre plateforme → tuile browse (même forme que les rangées « du moment »). */
export function platformTitleToItem(t: PlatformTitle): PlatformContentItem | null {
  if (!t || !t.id || (t.media_type !== 'movie' && t.media_type !== 'tv')) return null;
  const title = t.title || t.original_title || '';
  if (!title) return null;
  const date = t.release_date || t.first_air_date || undefined;
  return {
    id: `tmdb-${t.id}-${t.media_type}`,
    title,
    tmdbTitle: title,
    type: t.media_type,
    poster: t.poster_path ? `${TMDB_IMG}w500${t.poster_path}` : undefined,
    backdrop: t.backdrop_path ? `${TMDB_IMG}original${t.backdrop_path}` : undefined,
    overview: t.overview || undefined,
    rating: typeof t.vote_average === 'number' ? t.vote_average : undefined,
    releaseDate: date,
    firstAirDate: t.first_air_date || undefined,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    tmdbId: t.id,
    suggestionOnly: !t.in_library,
    exclusivity: t.exclusivity ?? null,
    inLibrary: Boolean(t.in_library),
  } as PlatformContentItem;
}
