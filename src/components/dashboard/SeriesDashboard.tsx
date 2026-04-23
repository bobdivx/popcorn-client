import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { formatDateForApi, toContentItem } from '../page-model/tmdb-mapper';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useSimpleTmdbDiscover } from '../page-model/useSimpleTmdbDiscover';

export default function SeriesDashboard() {
  const { t, language } = useI18n();
  const today = useMemo(() => formatDateForApi(new Date()), []);
  const sectionQueries = useMemo(
    () => [
      { id: 'popular', kind: 'tv' as const, params: { sort_by: 'popularity.desc' } },
      { id: 'topRated', kind: 'tv' as const, params: { sort_by: 'vote_average.desc', vote_count_gte: 200 } },
      { id: 'newReleases', kind: 'tv' as const, params: { sort_by: 'first_air_date.desc', first_air_date_lte: today } },
    ],
    [today]
  );
  const { itemsById, loading, error } = useSimpleTmdbDiscover(sectionQueries, language);
  const popular = itemsById.popular ?? [];
  const topRated = itemsById.topRated ?? [];
  const newReleases = itemsById.newReleases ?? [];

  const heroItems = useMemo(
    () => popular.slice(0, 5).map((item) => toContentItem(item, 'tv')).filter((item) => item.poster || item.backdrop),
    [popular]
  );

  const handleNavigate = (item: ContentItem) => {
    if (item.tmdbId) window.location.href = `/discover?tmdbId=${item.tmdbId}&type=${item.type || 'tv'}`;
  };

  const sections = useMemo(
    () => [
      { id: 'popular', title: t('discover.popularSeries'), items: popular.map((item) => toContentItem(item, 'tv')) },
      { id: 'topRated', title: t('discover.topRatedSeries'), items: topRated.map((item) => toContentItem(item, 'tv')) },
      { id: 'newReleases', title: t('discover.newReleases'), items: newReleases.map((item) => toContentItem(item, 'tv')) },
    ],
    [newReleases, popular, t, topRated]
  );

  return (
    <SimpleTmdbPage
      pageId="series"
      title={t('nav.series')}
      subtitle={t('discover.pageSubtitle')}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
    />
  );
}
