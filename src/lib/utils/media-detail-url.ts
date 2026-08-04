import type { ContentItem } from '../client/types';

type MediaType = 'movie' | 'tv';

function isMediaType(value: unknown): value is MediaType {
  return value === 'movie' || value === 'tv';
}

export interface BuildMediaDetailUrlOptions {
  tmdbId?: number | null;
  type?: string | null;
  slug?: string | null;
  from?: string | null;
  title?: string | null;
  /** Info-hash du torrent actif (ex. depuis /downloads) pour la lecture. */
  infoHash?: string | null;
  streamBackendUrl?: string | null;
  streamPath?: string | null;
}

/** URL canonique de la fiche média: TMDB-first, fallback slug. */
export function buildMediaDetailUrl(options: BuildMediaDetailUrlOptions): string {
  const params = new URLSearchParams();
  if (options.from) params.set('from', options.from);
  if (options.title) params.set('title', options.title);
  if (options.infoHash) params.set('infoHash', options.infoHash);
  if (options.streamBackendUrl) params.set('streamBackendUrl', options.streamBackendUrl);
  if (options.streamPath) params.set('streamPath', options.streamPath);

  if (typeof options.tmdbId === 'number' && Number.isFinite(options.tmdbId) && isMediaType(options.type)) {
    params.set('tmdbId', String(options.tmdbId));
    params.set('type', options.type);
    return `/torrents?${params.toString()}`;
  }

  const slug = (options.slug || '').trim();
  if (slug) {
    params.set('slug', slug);
    return `/torrents?${params.toString()}`;
  }

  return '/torrents';
}

export function buildMediaDetailUrlFromContentItem(item: ContentItem, from = 'dashboard'): string {
  return buildMediaDetailUrl({
    tmdbId: item.tmdbId ?? null,
    type: item.type,
    slug: item.id || null,
    from,
    title: item.title || item.tmdbTitle || null,
  });
}

/**
 * URL canonique stricte: TMDB uniquement.
 * Si tmdbId/type manquent, on redirige vers la recherche pour éviter les fiches non canoniques.
 */
export function buildStrictTmdbDetailUrl(options: BuildMediaDetailUrlOptions): string {
  if (typeof options.tmdbId === 'number' && Number.isFinite(options.tmdbId) && isMediaType(options.type)) {
    return buildMediaDetailUrl(options);
  }
  const params = new URLSearchParams();
  if (options.title) params.set('q', options.title);
  if (isMediaType(options.type)) params.set('type', options.type);
  if (options.from) params.set('from', options.from);
  return `/search?${params.toString()}`;
}

export function buildStrictTmdbDetailUrlFromContentItem(item: ContentItem, from = 'dashboard'): string {
  return buildStrictTmdbDetailUrl({
    tmdbId: item.tmdbId ?? null,
    type: item.type,
    from,
    title: item.title || item.tmdbTitle || null,
  });
}
