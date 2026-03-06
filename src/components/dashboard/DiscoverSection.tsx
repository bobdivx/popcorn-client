import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import CarouselRow from '../torrents/CarouselRow';

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
    type: type as 'movie' | 'tv',
    poster,
    overview: item.overview || undefined,
    rating: item.vote_average,
    releaseDate: date ? date.slice(0, 4) : undefined,
    firstAirDate: item.first_air_date,
    tmdbId: item.id,
    tmdbType: type,
  };
}

export default function DiscoverSection() {
  const { t, language } = useI18n();
  const [popularMovies, setPopularMovies] = useState<any[]>([]);
  const [popularTv, setPopularTv] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const lang = language === 'fr' ? 'fr-FR' : 'en-US';
        const [moviesRes, tvRes] = await Promise.all([
          serverApi.discoverMovies({ page: 1, language: lang, sort_by: 'popularity.desc' }),
          serverApi.discoverTv({ page: 1, language: lang, sort_by: 'popularity.desc' }),
        ]);
        if (moviesRes.success && moviesRes.data?.results) {
          setPopularMovies(
            moviesRes.data.results.map((m: TmdbItem) => toContentLike(m, 'movie'))
          );
        }
        if (tvRes.success && tvRes.data?.results) {
          setPopularTv(
            tvRes.data.results.map((m: TmdbItem) => toContentLike(m, 'tv'))
          );
        }
      } catch {
        // Silently fail - discover might not be configured
        setPopularMovies([]);
        setPopularTv([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [language]);

  const handleItemClick = (item: any) => {
    const tmdbId = item.tmdbId;
    const type = item.tmdbType || item.type;
    if (tmdbId) {
      window.location.href = `/discover?tmdbId=${tmdbId}&type=${type}`;
    }
  };

  if (loading || (popularMovies.length === 0 && popularTv.length === 0)) {
    return null;
  }

  return (
    <>
      {popularMovies.length > 0 && (
        <CarouselRow title={t('discover.discoverMovies')} autoScroll={false}>
          {popularMovies.map((item) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] cursor-pointer"
              onClick={() => handleItemClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleItemClick(item);
                }
              }}
            >
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    {item.title?.slice(0, 2) || '?'}
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-white truncate">{item.title}</p>
            </div>
          ))}
        </CarouselRow>
      )}
      {popularTv.length > 0 && (
        <CarouselRow title={t('discover.discoverSeries')} autoScroll={false}>
          {popularTv.map((item) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] cursor-pointer"
              onClick={() => handleItemClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleItemClick(item);
                }
              }}
            >
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-white/5">
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    {item.title?.slice(0, 2) || '?'}
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-white truncate">{item.title}</p>
            </div>
          ))}
        </CarouselRow>
      )}
    </>
  );
}
