/**
 * Suggestions « du moment » basées sur TMDB (sorties cinéma, tendances, séries en cours),
 * reliées à ce qui est disponible via les indexeurs / la bibliothèque.
 *
 * Avant : les rangées « Nouveautés » étaient construites uniquement à partir des torrents
 * synchronisés (tri par date d'ajout indexeur ou date TMDB brute), ce qui remontait
 * de vieux films ré-uploadés ou des titres confidentiels sans audience.
 */
import type { ContentItem } from '../../../lib/client/types';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../../lib/utils/media-detail-url';
import { contentItemKey } from './browsePriority';

export type HighlightList =
  | 'now_playing'
  | 'upcoming'
  | 'trending_movie'
  | 'trending_tv'
  | 'on_the_air'
  | 'airing_today';

export interface RawTmdbItem {
  id: number;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
}

/** Élément TMDB sans torrent/bibliothèque connu : ouvre la fiche « découverte » (demande possible). */
export type SuggestionItem = ContentItem & { suggestionOnly?: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
const TMDB_POSTER = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/original';

/** Talk-shows, news, soaps, télé-réalité : bruit dans « séries du moment ». */
const TV_NOISE_GENRES = new Set([10763, 10764, 10766, 10767]);

/** Fenêtre « récent » pour les rangées alimentées par les torrents disponibles. */
export const RECENT_RELEASE_WINDOW_DAYS = 365;

function daysSince(date: string | undefined, now: number): number {
  const t = Date.parse(date || '');
  return Number.isFinite(t) ? (now - t) / DAY_MS : Number.NaN;
}

function mediaTypeOf(list: HighlightList, item: RawTmdbItem): 'movie' | 'tv' | null {
  if (item.media_type === 'movie' || item.media_type === 'tv') return item.media_type;
  if (item.media_type) return null; // person, etc.
  return list === 'trending_tv' || list === 'on_the_air' || list === 'airing_today' ? 'tv' : 'movie';
}

/** Filtres anti-bruit : fenêtre de dates + seuils de votes/popularité. */
export function keepHighlight(list: HighlightList, item: RawTmdbItem, now = Date.now()): boolean {
  const type = mediaTypeOf(list, item);
  if (!type || !item.id) return false;
  if (!item.poster_path && !item.backdrop_path) return false;
  const votes = item.vote_count ?? 0;
  const pop = item.popularity ?? 0;
  const age = daysSince(item.release_date || item.first_air_date, now);
  if (type === 'tv' && (item.genre_ids ?? []).some((g) => TV_NOISE_GENRES.has(g))) return false;

  switch (list) {
    case 'now_playing':
      // Sorties salles FR des ~4 derniers mois (TMDB y laisse parfois des ressorties anciennes).
      return Number.isFinite(age) && age >= -14 && age <= 120 && (votes >= 5 || pop >= 20);
    case 'upcoming':
      return Number.isFinite(age) && age < 0 && age >= -120 && pop >= 5;
    case 'trending_movie':
      return Number.isFinite(age) && age <= 730 && (votes >= 20 || (age <= 45 && pop >= 20));
    case 'trending_tv':
      return votes >= 20 || pop >= 50;
    case 'on_the_air':
    case 'airing_today':
      return votes >= 20 && pop >= 10;
    default:
      return true;
  }
}

export function tmdbToSuggestion(list: HighlightList, item: RawTmdbItem): SuggestionItem | null {
  const type = mediaTypeOf(list, item);
  if (!type) return null;
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date || undefined;
  return {
    id: `tmdb-${item.id}-${type}`,
    title,
    tmdbTitle: title,
    type,
    poster: item.poster_path ? `${TMDB_POSTER}${item.poster_path}` : undefined,
    backdrop: item.backdrop_path ? `${TMDB_BACKDROP}${item.backdrop_path}` : undefined,
    overview: item.overview || undefined,
    rating: item.vote_average,
    releaseDate: date,
    firstAirDate: item.first_air_date,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    tmdbId: item.id,
    suggestionOnly: true,
  };
}

/** Index tmdb → élément disponible (torrent synchronisé ou bibliothèque). Premier gagnant. */
export function buildAvailabilityIndex(...sources: ContentItem[][]): Map<string, ContentItem> {
  const index = new Map<string, ContentItem>();
  for (const list of sources) {
    for (const item of list) {
      if (typeof item.tmdbId !== 'number') continue;
      const key = contentItemKey(item);
      if (!index.has(key)) index.set(key, item);
    }
  }
  return index;
}

/**
 * Relie chaque suggestion TMDB à son torrent / média local s'il existe et place
 * les titres disponibles en tête (ordre TMDB conservé dans chaque groupe).
 */
export function linkAvailability(items: SuggestionItem[], index: Map<string, ContentItem>): SuggestionItem[] {
  const available: SuggestionItem[] = [];
  const rest: SuggestionItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = contentItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = index.get(key);
    if (hit) {
      available.push({
        ...item,
        ...hit,
        title: hit.title || item.title,
        tmdbTitle: hit.tmdbTitle || item.tmdbTitle,
        poster: hit.poster || item.poster,
        backdrop: hit.backdrop || item.backdrop,
        overview: hit.overview || item.overview,
        releaseDate: item.releaseDate || hit.releaseDate,
        rating: item.rating ?? hit.rating,
        suggestionOnly: false,
      });
    } else {
      rest.push(item);
    }
  }
  return [...available, ...rest];
}

/**
 * Torrents disponibles réellement récents (≤ 12 mois), triés par seeders :
 * évite les vieux films ré-uploadés et les titres confidentiels sans audience.
 */
export function recentAvailable(items: ContentItem[], limit = 48, now = Date.now()): ContentItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const age = daysSince(item.releaseDate || item.firstAirDate, now);
      if (!Number.isFinite(age) || age < -7 || age > RECENT_RELEASE_WINDOW_DAYS) return false;
      const key = contentItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
    .slice(0, limit);
}

/** URL de navigation : fiche torrent si disponible, sinon fiche découverte TMDB. */
export function buildSuggestionUrl(item: ContentItem, from: string): string {
  const s = item as SuggestionItem;
  if (s.suggestionOnly && typeof item.tmdbId === 'number') {
    const params = new URLSearchParams();
    params.set('tmdbId', String(item.tmdbId));
    params.set('type', item.type);
    const title = item.tmdbTitle || item.title;
    if (title) params.set('title', title);
    return `/discover?${params.toString()}`;
  }
  return buildStrictTmdbDetailUrlFromContentItem(item, from);
}

/** Libellés des rangées (fr/en) — évite de toucher aux gros fichiers de locales. */
export function highlightTitles(language: string) {
  const en = language === 'en';
  return {
    nowPlaying: en ? 'Now in cinemas' : 'Sorties récentes au cinéma',
    upcoming: en ? 'Coming soon to cinemas' : 'Prochainement au cinéma',
    trendingWeek: en ? 'Trending this week' : 'Tendances de la semaine',
    trendingMovies: en ? 'Trending movies this week' : 'Films tendance de la semaine',
    trendingSeries: en ? 'Trending series this week' : 'Séries tendance de la semaine',
    onTheAir: en ? 'Series airing now · new episodes' : 'Séries du moment · nouveaux épisodes',
    recentAvailable: en ? 'Recent releases available' : 'Nouveautés disponibles (moins d’un an)',
  };
}
