import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { CarouselSection } from '../page-model/CarouselSection';
import { PageContainer } from '../page-model/PageContainer';
import { PageHeader } from '../page-model/PageHeader';
import { PosterCard } from '../page-model/PosterCard';

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

  const handlePlay = (item: ContentItem) => {
    const tmdbId = item.tmdbId;
    const type = item.type || 'movie';
    if (tmdbId) {
      window.location.href = `/discover?tmdbId=${tmdbId}&type=${type}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-black pt-4 sm:pt-6">
        <TorrentCardsShadowLoader rows={2} showHero />
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
    <PageContainer
      pageId="demandes"
      heroItems={heroItems}
      onHeroPlay={handlePlay}
      heroPrimaryButtonLabel={t('requests.requestMedia')}
      heroPrimaryButtonIcon={
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 tv:h-8 tv:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      }
    >
      <PageHeader title={t('nav.demandes')} subtitle={t('discover.pageSubtitle')} />
      <div className="pb-8 tv:pb-12 pt-2 tv:pt-4 overflow-visible animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0">
        {popularMovies.length > 0 && (
          <CarouselSection title={t('discover.popularMovies')}>
            {popularMovies.map((m) => (
              <PosterCard key={m.id} item={toContentItem(m, 'movie')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {topRatedMovies.length > 0 && (
          <CarouselSection title={t('discover.topRatedMovies')}>
            {topRatedMovies.map((m) => (
              <PosterCard key={m.id} item={toContentItem(m, 'movie')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {cinemaReleases.length > 0 && (
          <CarouselSection title={t('discover.cinemaReleases')}>
            {cinemaReleases.map((m) => (
              <PosterCard key={m.id} item={toContentItem(m, 'movie')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {vodReleases.length > 0 && (
          <CarouselSection title={t('discover.vodReleases')}>
            {vodReleases.map((m) => (
              <PosterCard key={m.id} item={toContentItem(m, 'movie')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {popularSeries.length > 0 && (
          <CarouselSection title={t('discover.popularSeries')}>
            {popularSeries.map((s) => (
              <PosterCard key={s.id} item={toContentItem(s, 'tv')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {topRatedSeries.length > 0 && (
          <CarouselSection title={t('discover.topRatedSeries')}>
            {topRatedSeries.map((s) => (
              <PosterCard key={s.id} item={toContentItem(s, 'tv')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}

        {newSeries.length > 0 && (
          <CarouselSection title={t('discover.newReleases')}>
            {newSeries.map((s) => (
              <PosterCard key={s.id} item={toContentItem(s, 'tv')} onNavigate={handlePlay} />
            ))}
          </CarouselSection>
        )}
      </div>
    </PageContainer>
  );
}
