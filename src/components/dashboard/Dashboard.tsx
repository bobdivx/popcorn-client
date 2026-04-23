import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { toContentItem } from '../page-model/tmdb-mapper';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useSimpleTmdbDiscover } from '../page-model/useSimpleTmdbDiscover';

export default function Dashboard() {
  const { t, language } = useI18n();
  const sectionQueries = useMemo(
    () => [
      { id: 'popularMovies', kind: 'movie' as const, params: { sort_by: 'popularity.desc' } },
      { id: 'popularSeries', kind: 'tv' as const, params: { sort_by: 'popularity.desc' } },
      { id: 'topMovies', kind: 'movie' as const, params: { sort_by: 'vote_average.desc', vote_count_gte: 500 } },
      { id: 'topSeries', kind: 'tv' as const, params: { sort_by: 'vote_average.desc', vote_count_gte: 200 } },
    ],
    []
  );
  const { itemsById, loading, error } = useSimpleTmdbDiscover(sectionQueries, language);
  const popularMovies = itemsById.popularMovies ?? [];
  const popularSeries = itemsById.popularSeries ?? [];
  const topMovies = itemsById.topMovies ?? [];
  const topSeries = itemsById.topSeries ?? [];

  const heroItems = useMemo(
    () =>
      [...popularMovies.slice(0, 3).map((m) => toContentItem(m, 'movie')), ...popularSeries.slice(0, 2).map((s) => toContentItem(s, 'tv'))].filter(
        (item) => item.poster || item.backdrop
      ),
    [popularMovies, popularSeries]
  );

  const handleNavigate = (item: ContentItem) => {
    if (item.tmdbId) window.location.href = `/discover?tmdbId=${item.tmdbId}&type=${item.type || 'movie'}`;
  };

  const sections = useMemo(
    () => [
      { id: 'popularMovies', title: t('discover.popularMovies'), items: popularMovies.map((item) => toContentItem(item, 'movie')) },
      { id: 'popularSeries', title: t('discover.popularSeries'), items: popularSeries.map((item) => toContentItem(item, 'tv')) },
      { id: 'topMovies', title: t('discover.topRatedMovies'), items: topMovies.map((item) => toContentItem(item, 'movie')) },
      { id: 'topSeries', title: t('discover.topRatedSeries'), items: topSeries.map((item) => toContentItem(item, 'tv')) },
    ],
    [popularMovies, popularSeries, t, topMovies, topSeries]
  );

  return (
    <SimpleTmdbPage
      pageId="dashboard"
      title={t('nav.dashboard')}
      subtitle={t('discover.pageSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
    />
  );
}
