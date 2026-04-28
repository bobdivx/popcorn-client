import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useInfiniteFilms } from './hooks/useInfiniteFilms';

export default function FilmsDashboard() {
  const { t } = useI18n();
  const { films, loading, error } = useInfiniteFilms();

  const heroItems = useMemo(
    () => films.slice(0, 5).filter((item) => item.poster || item.backdrop),
    [films]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
  };

  const sections = useMemo(
    () => [
      { id: 'synced-films', title: t('sync.allFilms'), items: films },
    ],
    [films, t]
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
      emptyTitle={t('sync.noFilmsSynced')}
      emptyDescription={t('sync.startSyncDescription')}
    />
  );
}
