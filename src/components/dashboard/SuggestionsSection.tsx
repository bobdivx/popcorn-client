import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import CarouselRow from '../torrents/CarouselRow';
import { useResumeWatching } from './hooks/useResumeWatching';
import { PosterCard } from '../page-model/PosterCard';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

interface TmdbItem {
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

function toContentLike(item: TmdbItem, type: 'movie' | 'tv') {
  const title = item.title || item.name || '';
  const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : null;
  const date = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb-${item.id}-${type}`,
    slug: `tmdb-${item.id}`,
    title,
    type: type,
    poster,
    overview: item.overview || undefined,
    rating: item.vote_average,
    year: date ? parseInt(date.slice(0, 4), 10) : undefined,
    firstAirDate: item.first_air_date,
    tmdbId: item.id,
    tmdbType: type,
  };
}

export default function SuggestionsSection({ contextType = 'all' }: { contextType?: 'all' | 'movies' | 'series' }) {
  const { t, language } = useI18n();
  const { resumeWatching } = useResumeWatching();
  const [suggestedMovies, setSuggestedMovies] = useState<any[]>([]);
  const [suggestedTv, setSuggestedTv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSuggestions = async () => {
      // Find the most recently watched/interacted movies and series
      const movies = resumeWatching.filter(i => i.type === 'movie' && i.tmdbId).slice(0, 2);
      const series = resumeWatching.filter(i => i.type === 'tv' && i.tmdbId).slice(0, 2);

      if (movies.length === 0 && series.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const lang = language === 'fr' ? 'fr-FR' : 'en-US';
        const promises = [];

        if (contextType === 'all' || contextType === 'movies') {
          for (const movie of movies) {
            promises.push(
              serverApi.getTmdbMovieRecommendations(movie.tmdbId!, lang)
                .then(res => ({ type: 'movie', res }))
            );
          }
        }

        if (contextType === 'all' || contextType === 'series') {
          for (const tv of series) {
            promises.push(
              serverApi.getTmdbTvRecommendations(tv.tmdbId!, lang)
                .then(res => ({ type: 'tv', res }))
            );
          }
        }

        const results = await Promise.all(promises);
        
        // Filter out items the user is already watching
        const watchedTmdbIds = new Set(resumeWatching.map(i => i.tmdbId).filter(Boolean));
        const addedMovieIds = new Set<number>();
        const addedTvIds = new Set<number>();
        
        const finalMovies: any[] = [];
        const finalTv: any[] = [];
        
        for (const { type, res } of results) {
          if (res.success && res.data?.results) {
            for (const item of res.data.results) {
              if (watchedTmdbIds.has(item.id)) continue;
              
              if (type === 'movie' && !addedMovieIds.has(item.id)) {
                addedMovieIds.add(item.id);
                finalMovies.push(toContentLike(item, 'movie'));
              } else if (type === 'tv' && !addedTvIds.has(item.id)) {
                addedTvIds.add(item.id);
                finalTv.push(toContentLike(item, 'tv'));
              }
            }
          }
        }
        
        // Limit to 20 suggestions each to avoid infinite scrolling row
        setSuggestedMovies(finalMovies.slice(0, 20));
        setSuggestedTv(finalTv.slice(0, 20));
      } catch (e) {
        console.error("Error loading suggestions", e);
      } finally {
        setLoading(false);
      }
    };

    loadSuggestions();
  }, [resumeWatching, language, contextType]);

  const handleItemClick = (item: any) => {
    const tmdbId = item.tmdbId;
    const type = item.tmdbType || item.type;
    if (tmdbId) {
      window.location.href = `/discover?tmdbId=${tmdbId}&type=${type}`;
    }
  };

  if (loading) {
    return (
      <>
        <CarouselRow title={t('dashboard.suggestionsMovies') || 'Films suggérés pour vous'} autoScroll={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
              <div className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse"></div>
              <div className="mt-2 h-4 w-3/4 bg-white/5 rounded animate-pulse"></div>
            </div>
          ))}
        </CarouselRow>
        <CarouselRow title={t('dashboard.suggestionsSeries') || 'Séries suggérées pour vous'} autoScroll={false}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
              <div className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse"></div>
              <div className="mt-2 h-4 w-3/4 bg-white/5 rounded animate-pulse"></div>
            </div>
          ))}
        </CarouselRow>
      </>
    );
  }

  if (suggestedMovies.length === 0 && suggestedTv.length === 0) {
    return null;
  }

  return (
    <div>
      {suggestedMovies.length > 0 && (
        <CarouselRow title={t('dashboard.suggestionsMovies') || 'Films suggérés pour vous'} autoScroll={false}>
          {suggestedMovies.map((item) => (
            <PosterCard key={item.id} item={item} onNavigate={handleItemClick} />
          ))}
        </CarouselRow>
      )}
      {suggestedTv.length > 0 && (
        <CarouselRow title={t('dashboard.suggestionsSeries') || 'Séries suggérées pour vous'} autoScroll={false}>
          {suggestedTv.map((item) => (
            <PosterCard key={item.id} item={item} onNavigate={handleItemClick} />
          ))}
        </CarouselRow>
      )}
    </div>
  );
}
