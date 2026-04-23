import type { ContentItem } from '../../lib/client/types';

export interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/original';

export function toContentItem(item: TmdbItem, type: 'movie' | 'tv'): ContentItem {
  const title = item.title || item.name || '';
  const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : null;
  const backdrop = item.backdrop_path ? `${TMDB_IMG_BACKDROP}${item.backdrop_path}` : null;
  const date = item.release_date || item.first_air_date || '';

  return {
    id: `tmdb-${item.id}-${type}`,
    title,
    tmdbTitle: title,
    type,
    poster: poster || undefined,
    backdrop: backdrop || undefined,
    overview: item.overview || undefined,
    rating: item.vote_average,
    releaseDate: date ? date.slice(0, 4) : undefined,
    firstAirDate: item.first_air_date,
    tmdbId: item.id,
  };
}

export function formatDateForApi(date: Date): string {
  return date.toISOString().slice(0, 10);
}
