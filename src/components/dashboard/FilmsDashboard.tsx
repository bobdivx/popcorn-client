import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { formatDateForApi, toContentItem } from '../page-model/tmdb-mapper';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useSimpleTmdbDiscover } from '../page-model/useSimpleTmdbDiscover';

export default function FilmsDashboard() {
  const { t, language } = useI18n();
  const today = useMemo(() => formatDateForApi(new Date()), []);
  const sectionQueries = useMemo(
    () => [
      { id: 'popular', kind: 'movie' as const, params: { sort_by: 'popularity.desc' } },
      { id: 'topRated', kind: 'movie' as const, params: { sort_by: 'vote_average.desc', vote_count_gte: 500 } },
      { id: 'newReleases', kind: 'movie' as const, params: { sort_by: 'primary_release_date.desc', primary_release_date_lte: today } },
    ],
    [today]
  );
  const { itemsById, loading, error } = useSimpleTmdbDiscover(sectionQueries, language);
  const popular = itemsById.popular ?? [];
  const topRated = itemsById.topRated ?? [];
  const newReleases = itemsById.newReleases ?? [];

  const heroItems = useMemo(
    () => popular.slice(0, 5).map((item) => toContentItem(item, 'movie')).filter((item) => item.poster || item.backdrop),
    [popular]
  );

  const handleNavigate = (item: ContentItem) => {
    if (item.tmdbId) window.location.href = `/discover?tmdbId=${item.tmdbId}&type=${item.type || 'movie'}`;
  };

  const sections = useMemo(
    () => [
      { id: 'popular', title: t('discover.popularMovies'), items: popular.map((item) => toContentItem(item, 'movie')) },
      { id: 'topRated', title: t('discover.topRatedMovies'), items: topRated.map((item) => toContentItem(item, 'movie')) },
      { id: 'newReleases', title: t('discover.newReleases'), items: newReleases.map((item) => toContentItem(item, 'movie')) },
    ],
    [newReleases, popular, t, topRated]
  );

  return (
    <SimpleTmdbPage
      pageId="films"
      title={t('nav.films')}
      subtitle={t('discover.pageSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
    />
  );
}
