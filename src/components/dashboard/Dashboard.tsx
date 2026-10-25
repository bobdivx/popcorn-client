import { useEffect, useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { SimpleTmdbPage } from '../page-model/SimpleTmdbPage';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useContentSignals } from './hooks/useContentSignals';
import { useActiveDownloads } from './hooks/useActiveDownloads';
import { useLibraryBrowse } from './hooks/useLibraryBrowse';
import { useTmdbHighlights } from './hooks/useTmdbHighlights';
import {
  buildAvailabilityIndex,
  buildSuggestionUrl,
  highlightTitles,
  type SuggestionItem,
  linkAvailability,
  newlyAvailableMovies,
  recentAvailable,
} from './utils/highlights';
import {
  pickFeaturedHero,
  filterWatchNow,
  standaloneDownloads,
  mergeReadyToWatch,
  excludeSeenItems,
  contentItemKey,
  uniqueByMedia,
} from './utils/browsePriority';
import {
  IS_STORE_BUILD,
  isIndexersModuleAvailable,
  isRequestsAvailable,
  isTorrentModuleAvailable,
} from '../../lib/distribution';
import { useServerCapabilities } from '../../lib/capabilities';
import StoreLibraryHome from './StoreLibraryHome';
import { markHomeReady } from '../../lib/boot/pageLoader';

function dedupeDashboardItems(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = contentItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Alterne films / séries pour une rangée « tendances » mixte. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/** Sans demandes possibles, ne garde que les suggestions TMDB reliées à un média disponible. */
function onlyRequestable(items: SuggestionItem[], canRequest: boolean): SuggestionItem[] {
  return canRequest ? items : items.filter((item) => !item.suggestionOnly);
}

function FullDashboard() {
  const { t, language } = useI18n();
  const { data, loading: dataLoading, error } = useDashboardData();
  const { activeDownloads, loading: downloadsLoading } = useActiveDownloads();
  const { resumeWatching, rewatchWatching } = useResumeWatching();
  const { recentDownloads } = useLibraryBrowse('all');
  const loading = dataLoading && downloadsLoading;
  // « Sorties récentes au cinéma » (now_playing) a quitté l'accueil : rangée affichée sur /demandes.
  const highlights = useTmdbHighlights(['trending_movie', 'trending_tv', 'on_the_air']);
  const titles = useMemo(() => highlightTitles(language), [language]);
  // Titres TMDB absents de la bibliothèque : ils ouvrent la fiche « demande ». Sans demandes
  // possibles (module Indexers absent / requests désactivé), on ne les propose pas sur l'accueil.
  const capabilities = useServerCapabilities();
  const canRequest = useMemo(() => isRequestsAvailable(), [capabilities]);
  // Rangée « Nouveaux films disponibles » : seulement si le serveur annonce torrent + indexers.
  const canDownload = useMemo(
    () => isTorrentModuleAvailable() && isIndexersModuleAvailable(),
    [capabilities]
  );

  // Écran de chargement unique : l'accueil se révèle quand ses premières données sont là et que
  // l'image du hero est décodée (au plus ~1,2 s d'attente), au lieu d'un skeleton intermédiaire.
  // Monté sous l'intro au démarrage (IndexRedirect) : tout ceci se fait pendant l'intro.
  useEffect(() => {
    if (dataLoading) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const heroImg = document.querySelector<HTMLImageElement>(
        '[data-page="dashboard"] .hero-dashboard img, [data-page="dashboard"] [data-editorial-hero] img',
      );
      if ((heroImg && heroImg.complete) || (!heroImg && elapsed > 300) || elapsed > 1200) {
        markHomeReady();
        return;
      }
      timer = setTimeout(tick, 80);
    };
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
    raf(() => raf(tick));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dataLoading]);

  const popularMovies = data?.popularMovies ?? [];
  const popularSeries = data?.popularSeries ?? [];
  const recentMovies = data?.recentMovies ?? [];
  const recentSeries = data?.recentSeries ?? [];
  const freshMovies = data?.freshMovies ?? [];
  const freshSeries = data?.freshSeries ?? [];

  const allDashboardItems = useMemo(
    () =>
      dedupeDashboardItems([
        ...recentMovies,
        ...recentSeries,
        ...freshMovies,
        ...freshSeries,
        ...popularMovies,
        ...popularSeries,
        ...activeDownloads,
        ...recentDownloads,
      ]),
    [
      popularMovies,
      popularSeries,
      recentMovies,
      recentSeries,
      freshMovies,
      freshSeries,
      activeDownloads,
      recentDownloads,
    ]
  );

  const { withSignals: allDashboardItemsWithSignals } = useContentSignals(allDashboardItems, resumeWatching);

  // Exclure Reprenez + contenus terminés (ex-À revoir) de « Prêts à regarder »
  const seenItems = useMemo(
    () => [...resumeWatching, ...rewatchWatching],
    [resumeWatching, rewatchWatching]
  );

  /** tmdb → torrent / média local, pour relier les suggestions TMDB à ce qui est disponible. */
  const availabilityIndex = useMemo(
    () =>
      buildAvailabilityIndex(
        recentDownloads,
        popularMovies,
        popularSeries,
        recentMovies,
        recentSeries,
        freshMovies,
        freshSeries
      ),
    [recentDownloads, popularMovies, popularSeries, recentMovies, recentSeries, freshMovies, freshSeries]
  );

  const heroItems = useMemo(() => {
    const watchNow = excludeSeenItems(filterWatchNow(allDashboardItemsWithSignals), seenItems);
    // Hero : prêts à regarder, puis nouveautés disponibles récentes, puis sorties / tendances TMDB.
    // (Les torrents « fraîchement syncés » ne servent plus : ce sont souvent de vieux films.)
    const newestUnwatched = excludeSeenItems(
      [
        ...recentDownloads,
        ...recentAvailable([...popularMovies, ...popularSeries, ...recentMovies, ...recentSeries], 12),
        ...onlyRequestable(linkAvailability(highlights.trending_movie ?? [], availabilityIndex), canRequest).slice(0, 6),
      ],
      seenItems
    );
    return pickFeaturedHero(watchNow, newestUnwatched);
  }, [
    allDashboardItemsWithSignals,
    seenItems,
    recentDownloads,
    recentMovies,
    recentSeries,
    popularMovies,
    popularSeries,
    highlights,
    availabilityIndex,
    canRequest,
  ]);

  const handleNavigate = (item: ContentItem) => {
    window.location.href = buildSuggestionUrl(item, 'dashboard');
  };

  const sections = useMemo(() => {
    const enrichedResumeWatching = resumeWatching.map((item) => {
      const active = activeDownloads.find(
        (ad) =>
          (ad.tmdbId != null && item.tmdbId != null && ad.tmdbId === item.tmdbId && ad.type === item.type) ||
          (ad.infoHash && item.infoHash && ad.infoHash === item.infoHash)
      );
      if (active) {
        return {
          ...item,
          isDownloading: true,
          downloadProgress: active.progress,
          downloadSpeed: active.downloadSpeed,
        };
      }
      return item;
    });

    const watchNowItems = excludeSeenItems(filterWatchNow(allDashboardItemsWithSignals), seenItems);
    const downloadingNow = standaloneDownloads(activeDownloads, resumeWatching);
    const readyToWatch = mergeReadyToWatch(
      excludeSeenItems(recentDownloads, seenItems),
      watchNowItems
    ).filter((item) => !downloadingNow.some((dl) => contentItemKey(dl) === contentItemKey(item)));

    const result = [];

    if (downloadingNow.length > 0) {
      result.push({
        id: 'active-downloads',
        title: t('dashboard.activeDownloads'),
        items: downloadingNow,
        kind: 'downloads' as const,
        priority: true,
      });
    }

    if (enrichedResumeWatching.length > 0) {
      result.push({
        id: 'resume-watching',
        title: t('dashboard.resumeWatching') || 'Reprendre la lecture',
        items: enrichedResumeWatching,
        kind: 'resume' as const,
        priority: true,
      });
    }

    if (readyToWatch.length > 0) {
      result.push({
        id: 'recently-downloaded',
        title: t('dashboard.recentlyDownloaded'),
        items: readyToWatch,
        priority: true,
      });
    }

    // Films récents nouvellement disponibles en téléchargement (torrents indexés), clic → fiche.
    const newlyAvailable = canDownload ? newlyAvailableMovies(freshMovies, recentMovies, 40) : [];
    const newlyAvailableKeys = new Set(newlyAvailable.map((item) => contentItemKey(item)));
    if (newlyAvailable.length > 0) {
      result.push({ id: 'newly-available-movies', title: titles.newlyAvailableMovies, items: newlyAvailable });
    }

    // Rangées « du moment » : TMDB (région FR), reliées aux torrents / à la bibliothèque.

    const trendingWeek = onlyRequestable(
      linkAvailability(
        interleave(highlights.trending_movie ?? [], highlights.trending_tv ?? []),
        availabilityIndex
      ),
      canRequest
    ).slice(0, 40);
    if (trendingWeek.length > 0) {
      result.push({ id: 'trending-week', title: titles.trendingWeek, items: trendingWeek });
    }

    const onTheAir = onlyRequestable(
      linkAvailability(highlights.on_the_air ?? [], availabilityIndex),
      canRequest
    ).slice(0, 40);
    if (onTheAir.length > 0) {
      result.push({ id: 'on-the-air', title: titles.onTheAir, items: onTheAir });
    }

    // Torrents disponibles réellement récents (≤ 12 mois), classés par seeders.
    const cinemaRecent = recentAvailable(
      uniqueByMedia([...popularMovies, ...popularSeries, ...recentMovies, ...recentSeries]).filter(
        (item) => !newlyAvailableKeys.has(contentItemKey(item))
      ),
      40
    );
    if (cinemaRecent.length > 0) {
      result.push({
        id: 'cinema-recent',
        title: titles.recentAvailable,
        items: cinemaRecent,
      });
    }

    const mostDownloaded = uniqueByMedia([...popularMovies, ...popularSeries])
      .sort((a, b) => (b.seeds ?? 0) - (a.seeds ?? 0))
      .slice(0, 40);
    if (mostDownloaded.length > 0) {
      result.push({
        id: 'most-downloaded',
        title: t('dashboard.mostDownloaded'),
        items: mostDownloaded,
      });
    }

    return result;
  }, [
    allDashboardItemsWithSignals,
    activeDownloads,
    resumeWatching,
    recentDownloads,
    seenItems,
    recentMovies,
    recentSeries,
    popularMovies,
    popularSeries,
    highlights,
    availabilityIndex,
    canRequest,
    canDownload,
    freshMovies,
    titles,
    t,
  ]);

  return (
    <SimpleTmdbPage
      pageId="dashboard"
      title=""
      heroItems={heroItems}
      sections={sections}
      loading={loading}
      error={error}
      onNavigate={handleNavigate}
      emptyTitle={t('sync.noTorrentsSynced')}
      emptyDescription={t('sync.startSyncAllDescription')}
    />
  );
}

/** Version store (PUBLIC_DISTRIBUTION=play) : bibliothèque du serveur uniquement, sans catalogue torrent. */
export default function Dashboard() {
  useEffect(() => {
    // Version store : StoreLibraryHome gère son propre chargement → ne pas retenir l'écran unique.
    if (IS_STORE_BUILD) markHomeReady();
  }, []);
  return IS_STORE_BUILD ? <StoreLibraryHome filter="all" /> : <FullDashboard />;
}
