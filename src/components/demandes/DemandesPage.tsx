import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from '../dashboard/components/HeroSection';
import type { ContentItem } from '../../lib/client/types';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/original';

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

function toContentItem(item: TmdbItem, type: 'movie' | 'tv'): ContentItem {
  const title = item.title || item.name || '';
  const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : null;
  const backdrop = item.backdrop_path ? `${TMDB_IMG_BACKDROP}${item.backdrop_path}` : null;
  const date = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb-${item.id}-${type}`,
    title,
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

function formatDateForApi(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DemandesPage() {
  const { t, language } = useI18n();
  const [popularMovies, setPopularMovies] = useState<TmdbItem[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<TmdbItem[]>([]);
  const [cinemaReleases, setCinemaReleases] = useState<TmdbItem[]>([]);
  const [vodReleases, setVodReleases] = useState<TmdbItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<TmdbItem[]>([]);
  const [topRatedSeries, setTopRatedSeries] = useState<TmdbItem[]>([]);
  const [newSeries, setNewSeries] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lang = language === 'fr' ? 'fr-FR' : 'en-US';

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const today = formatDateForApi(new Date());
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const vodStart = formatDateForApi(threeMonthsAgo);

        const [
          popMoviesRes,
          topMoviesRes,
          cinemaRes,
          vodRes,
          popTvRes,
          topTvRes,
          newTvRes,
        ] = await Promise.all([
          serverApi.discoverMovies({ page: 1, language: lang, sort_by: 'popularity.desc' }),
          serverApi.discoverMovies({
            page: 1,
            language: lang,
            sort_by: 'vote_average.desc',
            vote_count_gte: 500,
          }),
          serverApi.discoverMovies({
            page: 1,
            language: lang,
            sort_by: 'primary_release_date.desc',
            primary_release_date_lte: today,
          }),
          serverApi.discoverMovies({
            page: 1,
            language: lang,
            sort_by: 'primary_release_date.desc',
            primary_release_date_gte: vodStart,
            primary_release_date_lte: today,
          }),
          serverApi.discoverTv({ page: 1, language: lang, sort_by: 'popularity.desc' }),
          serverApi.discoverTv({
            page: 1,
            language: lang,
            sort_by: 'vote_average.desc',
            vote_count_gte: 200,
          }),
          serverApi.discoverTv({
            page: 1,
            language: lang,
            sort_by: 'first_air_date.desc',
            first_air_date_lte: today,
          }),
        ]);

        if (popMoviesRes.success && popMoviesRes.data?.results) {
          setPopularMovies(popMoviesRes.data.results);
        }
        if (topMoviesRes.success && topMoviesRes.data?.results) {
          setTopRatedMovies(topMoviesRes.data.results);
        }
        if (cinemaRes.success && cinemaRes.data?.results) {
          setCinemaReleases(cinemaRes.data.results.slice(0, 20));
        }
        if (vodRes.success && vodRes.data?.results) {
          setVodReleases(vodRes.data.results);
        }
        if (popTvRes.success && popTvRes.data?.results) {
          setPopularSeries(popTvRes.data.results);
        }
        if (topTvRes.success && topTvRes.data?.results) {
          setTopRatedSeries(topTvRes.data.results);
        }
        if (newTvRes.success && newTvRes.data?.results) {
          setNewSeries(newTvRes.data.results);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [language]);

  const heroItems = useMemo(() => {
    return popularMovies
      .filter((m) => m.poster_path || m.backdrop_path)
      .slice(0, 5)
      .map((m) => toContentItem(m, 'movie'));
  }, [popularMovies]);

  const handleItemClick = (item: ContentItem) => {
    const tmdbId = item.tmdbId;
    const type = item.type || 'movie';
    if (tmdbId) {
      window.location.href = `/discover?tmdbId=${tmdbId}&type=${type}`;
    }
  };

  const handlePlay = (item: ContentItem) => {
    handleItemClick(item);
  };

  const renderPosterCard = (item: ContentItem) => {
    const imageUrl = item.poster || item.backdrop;
    return (
    <div
      key={item.id}
      className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] cursor-pointer group"
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
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-white/5 ring-2 ring-transparent group-hover:ring-primary/50 transition-all duration-300">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            {item.title?.slice(0, 2) || '?'}
          </div>
        )}
        {item.rating != null && (
          <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs font-semibold">
            ⭐ {item.rating.toFixed(1)}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-white truncate group-hover:text-primary transition-colors">
        {item.title}
      </p>
      {item.releaseDate && (
        <p className="text-xs text-gray-400">{item.releaseDate}</p>
      )}
    </div>
  );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] bg-black">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
        <p className="text-red-400 text-center mb-4">{error}</p>
        <p className="text-gray-400 text-sm text-center">
          {t('discover.noTorrentsYet')}
        </p>
      </div>
    );
  }

  const hasAnyContent =
    popularMovies.length > 0 ||
    popularSeries.length > 0 ||
    topRatedMovies.length > 0 ||
    topRatedSeries.length > 0 ||
    cinemaReleases.length > 0 ||
    vodReleases.length > 0 ||
    newSeries.length > 0;

  if (!hasAnyContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
        <p className="text-gray-400 text-center">{t('discover.noTorrentsYet')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* En-tête */}
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-4 sm:pt-6 pb-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl tv:text-5xl font-bold text-white mb-2">
          {t('nav.demandes')}
        </h1>
        <p className="text-gray-400 text-sm sm:text-base">{t('discover.pageSubtitle')}</p>
      </div>

      {/* Hero avec films populaires */}
      {heroItems.length > 0 && (
        <HeroSection
          items={heroItems}
          onPlay={handlePlay}
          primaryButtonLabel={t('requests.requestMedia')}
          primaryButtonIcon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 tv:h-8 tv:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          }
        />
      )}

      <div className="pb-8 tv:pb-12 -mt-4">
        {/* Films populaires */}
        {popularMovies.length > 0 && (
          <CarouselRow title={t('discover.popularMovies')} autoScroll={false}>
            {popularMovies.map((m) => renderPosterCard(toContentItem(m, 'movie')))}
          </CarouselRow>
        )}

        {/* Films les mieux notés */}
        {topRatedMovies.length > 0 && (
          <CarouselRow title={t('discover.topRatedMovies')} autoScroll={false}>
            {topRatedMovies.map((m) => renderPosterCard(toContentItem(m, 'movie')))}
          </CarouselRow>
        )}

        {/* Sorties cinéma */}
        {cinemaReleases.length > 0 && (
          <CarouselRow title={t('discover.cinemaReleases')} autoScroll={false}>
            {cinemaReleases.map((m) => renderPosterCard(toContentItem(m, 'movie')))}
          </CarouselRow>
        )}

        {/* Sorties VOD / Nouveautés films */}
        {vodReleases.length > 0 && (
          <CarouselRow title={t('discover.vodReleases')} autoScroll={false}>
            {vodReleases.map((m) => renderPosterCard(toContentItem(m, 'movie')))}
          </CarouselRow>
        )}

        {/* Séries populaires */}
        {popularSeries.length > 0 && (
          <CarouselRow title={t('discover.popularSeries')} autoScroll={false}>
            {popularSeries.map((s) => renderPosterCard(toContentItem(s, 'tv')))}
          </CarouselRow>
        )}

        {/* Séries les mieux notées */}
        {topRatedSeries.length > 0 && (
          <CarouselRow title={t('discover.topRatedSeries')} autoScroll={false}>
            {topRatedSeries.map((s) => renderPosterCard(toContentItem(s, 'tv')))}
          </CarouselRow>
        )}

        {/* Nouveautés séries */}
        {newSeries.length > 0 && (
          <CarouselRow title={t('discover.newReleases')} autoScroll={false}>
            {newSeries.map((s) => renderPosterCard(toContentItem(s, 'tv')))}
          </CarouselRow>
        )}
      </div>
    </div>
  );
}
