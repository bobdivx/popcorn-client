import type { ContentItem } from '../../../lib/client/types';

export function contentItemKey(item: ContentItem): string {
  if (typeof item.tmdbId === 'number') return `${item.type}:${item.tmdbId}`;
  if (item.id) return `id:${item.id}`;
  if (item.infoHash) return `infoHash:${item.infoHash}`;
  return `fallback:${item.title}:${item.type}`;
}

/**
 * Pool de candidats hero (le HeroSection n’en affiche qu’un, tiré au sort
 * une fois par chargement de page — priorité aux titres avec trailer).
 */
export function pickHeroItems(preferred: ContentItem[], fallback: ContentItem[] = [], limit = 8): ContentItem[] {
  const seen = new Set<string>();
  const out: ContentItem[] = [];
  for (const item of [...preferred, ...fallback]) {
    if (!item.poster && !item.backdrop) continue;
    const key = contentItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Hero catalogue : téléchargés non vus / prêts, puis sorties récentes non vues.
 * N'inclut ni « Reprendre » ni « À revoir ».
 * Retourne un pool ; l’affichage reste un seul titre (choix aléatoire au mount).
 */
export function pickFeaturedHero(
  watchNow: ContentItem[],
  newestUnwatched: ContentItem[] = [],
  limit = 8
): ContentItem[] {
  return pickHeroItems(watchNow, newestUnwatched, limit);
}

/** Retire les titres déjà en Reprendre / À revoir (ou toute liste « vu / en cours »). */
export function excludeSeenItems(items: ContentItem[], seen: ContentItem[]): ContentItem[] {
  if (seen.length === 0) return items;
  const keys = new Set(seen.map(contentItemKey));
  return items.filter((item) => !keys.has(contentItemKey(item)));
}

export function filterWatchNow(items: ContentItem[], limit = 25): ContentItem[] {
  return items
    .filter((item) => item.heroSignal?.downloadedUnseen || item.heroSignal?.requestDownloaded)
    .slice(0, limit);
}

export function filterByMediaType<T extends { type?: string }>(items: T[], type: 'movie' | 'tv'): T[] {
  return items.filter((item) => item.type === type);
}

export function matchesResume(download: ContentItem, resume: ContentItem): boolean {
  if (download.tmdbId != null && resume.tmdbId != null && download.tmdbId === resume.tmdbId && download.type === resume.type) {
    return true;
  }
  if (download.infoHash && resume.infoHash && download.infoHash === resume.infoHash) {
    return true;
  }
  return false;
}

export function standaloneDownloads(activeDownloads: ContentItem[], resumeWatching: ContentItem[]): ContentItem[] {
  return activeDownloads.filter((ad) => !resumeWatching.some((rw) => matchesResume(ad, rw)));
}

/**
 * Une seule file « Prêts à regarder » : téléchargements en cours d'abord
 * (avec barre de progression), puis titres prêts, sans doublon TMDB/id.
 */
export function mergeReadyToWatch(
  downloading: ContentItem[],
  ready: ContentItem[],
): ContentItem[] {
  const seen = new Set<string>();
  const out: ContentItem[] = [];

  for (const dl of downloading) {
    const key = contentItemKey(dl);
    if (seen.has(key)) continue;
    seen.add(key);
    const match = ready.find((r) => contentItemKey(r) === key);
    if (match) {
      out.push({
        ...match,
        ...dl,
        poster: dl.poster || match.poster,
        backdrop: dl.backdrop || match.backdrop,
        title: dl.title || match.title,
        tmdbTitle: dl.tmdbTitle || match.tmdbTitle,
        isDownloading: true,
        progress: dl.progress,
        downloadSpeed: dl.downloadSpeed ?? match.downloadSpeed,
        heroSignal: match.heroSignal ?? dl.heroSignal,
      });
    } else {
      out.push(dl);
    }
  }

  for (const item of ready) {
    const key = contentItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

/** Fenêtre « Derniers téléchargements » (2 semaines). */
export const RECENT_DOWNLOAD_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const RECENT_DOWNLOAD_LIMIT = 40;

/**
 * Médias téléchargés récemment (≤ maxAge), plus les téléchargements en cours.
 * Tri : en cours d'abord, puis addedAt décroissant.
 * Sans `addedAt` : on garde les titres présents en bibliothèque (évite une file trop courte).
 */
export function filterRecentDownloads(
  items: ContentItem[],
  now = Date.now(),
  maxAgeMs = RECENT_DOWNLOAD_MAX_AGE_MS,
  limit = RECENT_DOWNLOAD_LIMIT
): ContentItem[] {
  const cutoffSec = Math.floor((now - maxAgeMs) / 1000);
  return [...items]
    .filter((item) => {
      if (item.isDownloading) return true;
      if (typeof item.addedAt === 'number') return item.addedAt >= cutoffSec;
      return item.availableInLibrary === true;
    })
    .sort((a, b) => {
      const aDl = a.isDownloading ? 1 : 0;
      const bDl = b.isDownloading ? 1 : 0;
      if (aDl !== bDl) return bDl - aDl;
      const aHasDate = typeof a.addedAt === 'number' ? 1 : 0;
      const bHasDate = typeof b.addedAt === 'number' ? 1 : 0;
      if (aHasDate !== bHasDate) return bHasDate - aHasDate;
      return (b.addedAt ?? 0) - (a.addedAt ?? 0);
    })
    .slice(0, limit);
}

/** Place les titres présents dans `recentKeys` en tête du carrousel (ordre relatif conservé). */
export function promoteRecentFirst<T extends ContentItem>(items: T[], recentKeys: Set<string>): T[] {
  if (recentKeys.size === 0 || items.length === 0) return items;
  const recent: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (recentKeys.has(contentItemKey(item))) recent.push(item);
    else rest.push(item);
  }
  return [...recent, ...rest];
}

export function recentDownloadKeys(items: ContentItem[]): Set<string> {
  return new Set(items.map(contentItemKey));
}

/** Clé stable (anglais TMDB) pour regrouper « Drame » et « Drama ». */
export function genreKey(genre: string): string {
  const raw = genre.trim().toLowerCase();
  if (!raw) return '';
  const table: Record<string, string> = {
    action: 'Action',
    adventure: 'Adventure',
    aventure: 'Adventure',
    animation: 'Animation',
    comedy: 'Comedy',
    comédie: 'Comedy',
    comedie: 'Comedy',
    crime: 'Crime',
    documentary: 'Documentary',
    documentaire: 'Documentary',
    drama: 'Drama',
    drame: 'Drama',
    family: 'Family',
    famille: 'Family',
    fantasy: 'Fantasy',
    fantastique: 'Fantasy',
    history: 'History',
    histoire: 'History',
    horror: 'Horror',
    horreur: 'Horror',
    music: 'Music',
    musique: 'Music',
    mystery: 'Mystery',
    mystère: 'Mystery',
    mystere: 'Mystery',
    romance: 'Romance',
    'science fiction': 'Science Fiction',
    'science-fiction': 'Science Fiction',
    'tv movie': 'TV Movie',
    téléfilm: 'TV Movie',
    telefilm: 'TV Movie',
    thriller: 'Thriller',
    war: 'War',
    guerre: 'War',
    western: 'Western',
  };
  return table[raw] ?? genre.trim();
}

export function itemInGenre(item: ContentItem, genre: string | null): boolean {
  if (!genre) return true;
  const want = genreKey(genre);
  return (item.genres ?? []).some((g) => genreKey(g) === want);
}

export interface GenreCount {
  key: string;
  count: number;
}

/** Un titre par TMDB, pour ne pas remplir une rangée avec plusieurs qualités du même film. */
export function uniqueByMedia(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  const out: ContentItem[] = [];
  for (const item of items) {
    const key = contentItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function byReleaseDate(items: ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) => {
    const da = Date.parse(a.releaseDate || a.firstAirDate || '') || 0;
    const db = Date.parse(b.releaseDate || b.firstAirDate || '') || 0;
    return db - da;
  });
}

/** Note TMDB d'abord, seeders ensuite. Les titres sans note passent après. */
export function byPopularity(items: ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    const aRated = ra > 0 ? 1 : 0;
    const bRated = rb > 0 ? 1 : 0;
    if (aRated !== bRated) return bRated - aRated;
    if (rb !== ra) return rb - ra;
    return (b.seeds ?? 0) - (a.seeds ?? 0);
  });
}

/** Genres présents, avec le nombre de titres uniques. */
export function topGenres(items: ContentItem[]): GenreCount[] {
  const counts = new Map<string, number>();
  for (const item of uniqueByMedia(items)) {
    const seen = new Set<string>();
    for (const genre of item.genres ?? []) {
      const key = genreKey(genre);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const all = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
  if (all.length > 12) return all.filter((g) => g.count >= 4);
  return all;
}
