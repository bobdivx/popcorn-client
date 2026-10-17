import type { ContentItem } from '../client/types';
import { IS_STORE_BUILD, MEDIA_DETAIL_PATH } from '../distribution';

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

  const slug = (options.slug || '').trim();
  // Version store : les éléments de la bibliothèque (slug local_…) s'ouvrent par slug (pas de recherche de sources).
  const preferLocalSlug = IS_STORE_BUILD && slug.startsWith('local_');

  if (!preferLocalSlug && typeof options.tmdbId === 'number' && Number.isFinite(options.tmdbId) && isMediaType(options.type)) {
    params.set('tmdbId', String(options.tmdbId));
    params.set('type', options.type);
    return `${MEDIA_DETAIL_PATH}?${params.toString()}`;
  }

  if (slug) {
    params.set('slug', slug);
    return `${MEDIA_DETAIL_PATH}?${params.toString()}`;
  }

  return MEDIA_DETAIL_PATH;
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
 * URL canonique stricte: TMDB d'abord, puis slug en fallback.
 * Si tmdbId/type manquent et qu'il n'y a pas de slug, on redirige vers la recherche.
 */
export function buildStrictTmdbDetailUrl(options: BuildMediaDetailUrlOptions): string {
  if (IS_STORE_BUILD && (options.slug || '').trim().startsWith('local_')) {
    return buildMediaDetailUrl(options);
  }
  if (typeof options.tmdbId === 'number' && Number.isFinite(options.tmdbId) && isMediaType(options.type)) {
    return buildMediaDetailUrl(options);
  }
  // Fallback sur slug si disponible (mode démo)
  const slug = (options.slug || '').trim();
  if (slug) {
    return buildMediaDetailUrl({
      slug,
      from: options.from,
      title: options.title,
      infoHash: options.infoHash,
      streamBackendUrl: options.streamBackendUrl,
      streamPath: options.streamPath,
    });
  }
  const params = new URLSearchParams();
  if (options.title) params.set('q', options.title);
  if (isMediaType(options.type)) params.set('type', options.type);
  if (options.from) params.set('from', options.from);
  // Version store : pas de recherche (torrents) → retour à la bibliothèque.
  if (IS_STORE_BUILD) return '/dashboard';
  return `/search?${params.toString()}`;
}

export function buildStrictTmdbDetailUrlFromContentItem(item: ContentItem, from = 'dashboard'): string {
  return buildStrictTmdbDetailUrl({
    tmdbId: item.tmdbId ?? null,
    type: item.type,
    slug: item.id || null,
    from,
    title: item.title || item.tmdbTitle || null,
  });
}
