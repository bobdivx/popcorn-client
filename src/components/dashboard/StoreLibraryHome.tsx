/**
 * Accueil de la version store (PUBLIC_DISTRIBUTION=play) : uniquement la bibliothèque
 * personnelle du serveur de l'utilisateur (GET /library) + reprise de lecture.
 * Aucune donnée issue du catalogue torrent / indexeurs.
 */
import { useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useLibraryBrowse, type LibraryBrowseFilter } from './hooks/useLibraryBrowse';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';

const SECTION_LIMIT = 60;

function byTitle(a: ContentItem, b: ContentItem): number {
  return (a.title || '').localeCompare(b.title || '');
}

function byAddedDesc(a: ContentItem, b: ContentItem): number {
  return (b.addedAt ?? 0) - (a.addedAt ?? 0);
}

export default function StoreLibraryHome({ filter = 'all' }: { filter?: LibraryBrowseFilter }) {
  const { t, language } = useI18n();
  const en = language === 'en';
  const { libraryItems, loading } = useLibraryBrowse(filter);
  const { resumeWatching } = useResumeWatching();

  const available = useMemo(
    () => libraryItems.filter((item) => item.availableInLibrary !== false),
    [libraryItems]
  );

  const sections = useMemo(() => {
    const resume = resumeWatching.filter((item) =>
      filter === 'movies' ? item.type === 'movie' : filter === 'series' ? item.type === 'tv' : true
    );
    const movies = available.filter((item) => item.type === 'movie').sort(byTitle);
    const series = available.filter((item) => item.type === 'tv').sort(byTitle);
    const out = [
      { id: `store-resume-${filter}`, title: t('dashboard.resumeWatching'), items: resume, kind: 'resume' as const, priority: true },
      {
        id: `store-recent-${filter}`,
        title: en ? 'Recently added' : 'Ajoutés récemment',
        items: [...available].sort(byAddedDesc).slice(0, SECTION_LIMIT),
        priority: true,
      },
    ];
    if (filter !== 'series') out.push({ id: 'store-movies', title: t('nav.films'), items: movies, priority: false });
    if (filter !== 'movies') out.push({ id: 'store-series', title: t('nav.series'), items: series, priority: false });
    return out;
  }, [available, resumeWatching, filter, t, en]);

  const heroItems = useMemo(
    () => available.filter((item) => item.backdrop || item.poster).sort(byAddedDesc).slice(0, 5),
    [available]
  );

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildStrictTmdbDetailUrlFromContentItem(
      item,
      filter === 'movies' ? 'films' : filter === 'series' ? 'series' : 'dashboard'
    );
  };

  return (
    <SimpleTmdbPage
      pageId={filter === 'movies' ? 'films' : filter === 'series' ? 'series' : 'dashboard'}
      title={filter === 'movies' ? t('nav.films') : filter === 'series' ? t('nav.series') : ''}
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={null}
      onNavigate={handleNavigate}
      emptyTitle={en ? 'Your library is empty' : 'Votre bibliothèque est vide'}
      emptyDescription={
        en
          ? 'Videos stored on your Popcornn server will appear here.'
          : 'Les vidéos présentes sur votre serveur Popcornn apparaîtront ici.'
      }
    />
  );
}
