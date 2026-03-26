import { useMemo, useEffect, useRef, useState } from 'preact/hooks';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useSyncStatus } from './hooks/useSyncStatus';
import { refreshSyncStatusStore } from '../../lib/sync-status-store';
import type { ContentItem } from '../../lib/client/types';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from './components/HeroSection';
import { LazyResumePoster } from './components/LazyResumePoster';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import { GenreCardsRow } from './components/GenreCardsRow';
import { SyncCard } from './components/SyncCard';
import { SyncProgress } from '../setup/components/SyncProgress';
import { useI18n } from '../../lib/i18n/useI18n';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';

function normalizeGenreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

function itemHasGenre(item: ContentItem, selectedGenre: string | null): boolean {
  if (!selectedGenre) return true;
  if (!item.genres || item.genres.length === 0) return false;
  const wanted = normalizeGenreKey(selectedGenre);
  return item.genres.some((g) => normalizeGenreKey(g) === wanted);
}

function isUsableImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/') ||
    value.startsWith('data:image/')
  );
}

export default function Dashboard() {
  const { t, language } = useI18n();
  const { data, loading, error, reload, reloadSilent } = useDashboardData();
  const { resumeWatching, rewatchWatching, watchedIds } = useResumeWatching();
  const isWatched = (item: ContentItem) =>
    watchedIds.has(item.id) || (item.tmdbId != null && watchedIds.has(String(item.tmdbId)));
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const wasSyncingRef = useRef(false);
  const clearedBySyncRef = useRef(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Quand l’onglet redevient visible : recharger les données depuis le backend (source de vérité). Pas de spinner.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadSilent();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reloadSilent]);

  // Au montage : mettre à jour le statut sync pour que totalTorrentsFromSync soit à jour (0 après "vider") et déclencher le rechargement si besoin.
  useEffect(() => {
    refreshSyncStatusStore();
  }, []);

  // Après "vider les torrents" (Settings) : recharger pour vider le dashboard même si on est sur une autre page / que le statut sync n'a pas encore été rafraîchi (ex. accès via IP).
  useEffect(() => {
    const handler = () => {
      clearedBySyncRef.current = true;
      reload();
    };
    window.addEventListener('popcorn:torrents-cleared', handler);
    return () => window.removeEventListener('popcorn:torrents-cleared', handler);
  }, [reload]);

  // Source de vérité : si la sync dit 0 torrents en base mais le dashboard affiche encore du contenu,
  // recharger une seule fois pour vider (évite une boucle).
  const totalTorrentsFromSync = syncStatus?.stats
    ? Object.values(syncStatus.stats).reduce((a: number, b: unknown) => a + Number(b), 0)
    : -1;
  const hasDataToClear = data && (
    (data.popularMovies?.length ?? 0) > 0 ||
    (data.popularSeries?.length ?? 0) > 0 ||
    (data.recentMovies?.length ?? 0) > 0 ||
    (data.recentSeries?.length ?? 0) > 0 ||
    (data.recentAdditions?.length ?? 0) > 0 ||
    (data.fastTorrents?.length ?? 0) > 0
  );
  useEffect(() => {
    if (syncLoading || totalTorrentsFromSync !== 0 || !hasDataToClear) return;
    if (clearedBySyncRef.current) return;
    clearedBySyncRef.current = true;
    reload();
  }, [syncLoading, totalTorrentsFromSync, hasDataToClear, reload]);

  // Ne rafraîchir les données qu'à la fin de la sync (pas pendant) pour éviter que les cartes bougent sur le dashboard
  useEffect(() => {
    if (!isSyncing) {
      if (wasSyncingRef.current) reloadSilent();
      wasSyncingRef.current = false;
      return;
    }
    wasSyncingRef.current = true;
  }, [isSyncing, reloadSilent]);

  const handlePlay = (item: ContentItem) => {
    const playHref = item.infoHash
      ? `/torrents?slug=${encodeURIComponent(item.id)}&infoHash=${encodeURIComponent(item.infoHash)}&from=dashboard`
      : `/torrents?slug=${encodeURIComponent(item.id)}&from=dashboard`;
    window.location.href = playHref;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black pt-4 sm:pt-6">
        <TorrentCardsShadowLoader rows={3} showHero />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="alert alert-error max-w-2xl">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // Vérifier s'il y a des torrents synchronisés
  const totalTorrents = syncStatus?.stats 
    ? Object.values(syncStatus.stats).reduce((sum, count) => sum + count, 0)
    : 0;
  const hasTorrents = totalTorrents > 0;
  
  // Vérifier s'il y a des données à afficher
  const hasData = data && (
    (data.popularMovies && data.popularMovies.length > 0) ||
    (data.popularSeries && data.popularSeries.length > 0) ||
    (data.continueWatching && data.continueWatching.length > 0) ||
    (data.recentMovies && data.recentMovies.length > 0) ||
    (data.recentSeries && data.recentSeries.length > 0) ||
    (data.recentAdditions && data.recentAdditions.length > 0) ||
    resumeWatching.length > 0
  );

  // Barre compacte en haut quand une sync est en cours (on ne dépend pas de syncLoading pour éviter qu'elle disparaisse à chaque poll)
  const showSyncBar = isSyncing;

  // Afficher la carte de synchronisation si:
  // - Pas de données ET pas de synchronisation en cours ET pas de torrents synchronisés
  if ((!data || !hasData) && !syncLoading && !isSyncing && !hasTorrents) {
    return (
      <div className="min-h-screen bg-black text-white">
        <SyncCard type="all" />
      </div>
    );
  }

  if (!data) {
    if (!isSyncing) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
          <div className="text-center max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-4">
              {t('common.noData')}
            </h2>
            <p className="text-gray-400 text-lg">
              {t('dashboard.noContent')}
            </p>
          </div>
        </div>
      );
    }
    // Sync en cours mais pas de données : afficher barre compacte + message
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
          <p className="text-gray-400 text-center">{t('sync.syncDescription')}</p>
          <p className="text-gray-500 text-sm mt-2 text-center">
            {t('dashboard.syncAppearing')}
          </p>
        </div>
      </div>
    );
  }

  const allGenres = useMemo(() => {
    const set = new Map<string, string>();
    const merged = [
      ...(data.popularMovies ?? []),
      ...(data.popularSeries ?? []),
      ...(data.recentMovies ?? []),
      ...(data.recentSeries ?? []),
      ...(data.fastTorrents ?? []),
    ];
    for (const item of merged) {
      if (!item.genres) continue;
      for (const g of item.genres) {
        const key = normalizeGenreKey(g);
        if (!key || set.has(key)) continue;
        set.set(key, g.trim());
      }
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const genreBackgrounds = useMemo(() => {
    const map: Record<string, string> = {};
    const candidates = [
      ...(data.popularMovies ?? []),
      ...(data.popularSeries ?? []),
      ...(data.recentMovies ?? []),
      ...(data.recentSeries ?? []),
      ...(data.fastTorrents ?? []),
    ];
    const candidateUrls = candidates
      .map((item) => item.backdrop || item.poster || null)
      .filter(isUsableImageUrl);
    const usedImageUrls = new Set<string>();
    usedImageUrls.add('/media-generic.svg');
    for (const genre of allGenres) {
      const wanted = normalizeGenreKey(genre);
      const match = candidates.find((item) => {
        if (!item.genres || item.genres.length === 0) return false;
        const hasGenre = item.genres.some((g) => normalizeGenreKey(g) === wanted);
        if (!hasGenre) return false;
        const rawUrl = item.backdrop || item.poster || null;
        const url = isUsableImageUrl(rawUrl) ? rawUrl : null;
        if (!url) return false;
        return !usedImageUrls.has(url);
      });
      const rawBg = match?.backdrop || match?.poster || null;
      const bg = isUsableImageUrl(rawBg) ? rawBg : null;
      if (bg) {
        map[genre] = bg;
        usedImageUrls.add(bg);
      } else {
        // Fallback "photo réelle" : prendre une image non utilisée, même hors-genre.
        const anyUnused = candidateUrls.find((url) => !usedImageUrls.has(url));
        if (anyUnused) {
          map[genre] = anyUnused;
          usedImageUrls.add(anyUnused);
        } else {
          map[genre] = '/media-generic.svg';
        }
      }
    }
    return map;
  }, [allGenres, data]);

  const recentMoviesRow = useMemo(
    () => (data.recentMovies ?? []).filter((item) => !isWatched(item) && itemHasGenre(item, selectedGenre)),
    [data.recentMovies, isWatched, selectedGenre]
  );
  const recentSeriesRow = useMemo(
    () => (data.recentSeries ?? []).filter((item) => !isWatched(item) && itemHasGenre(item, selectedGenre)),
    [data.recentSeries, isWatched, selectedGenre]
  );
  const sharedMoviesRow = useMemo(
    () =>
      (data.fastTorrents ?? []).filter(
        (item) => item.type === 'movie' && !isWatched(item) && itemHasGenre(item, selectedGenre)
      ),
    [data.fastTorrents, isWatched, selectedGenre]
  );
  const sharedSeriesRow = useMemo(
    () =>
      (data.fastTorrents ?? []).filter(
        (item) => item.type === 'tv' && !isWatched(item) && itemHasGenre(item, selectedGenre)
      ),
    [data.fastTorrents, isWatched, selectedGenre]
  );

  // Préparer les données pour le hero (combiner films et séries populaires)
  const heroItems: ContentItem[] = [];
  if (data.hero) {
    heroItems.push(data.hero);
  }
  if (data.popularMovies && data.popularMovies.length > 0) {
    heroItems.push(...data.popularMovies.slice(0, 2));
  }
  if (data.popularSeries && data.popularSeries.length > 0) {
    heroItems.push(...data.popularSeries.slice(0, 2));
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Barre de progression compacte en haut quand sync en cours */}
      {showSyncBar && <SyncProgress compact externalStatus={syncStatus} />}

      {/* Section Hero avec carousel */}
      {heroItems.length > 0 && (
        <HeroSection
          items={heroItems}
          onPlay={handlePlay}
          onPrimaryAction={handlePlay}
          size="large"
        />
      )}

      <div className="pt-2 sm:pt-3 pb-8 tv:pb-12">
        {/* Section Reprendre la lecture — en tête de page */}
        {(resumeWatching.length > 0 || (data.continueWatching && data.continueWatching.length > 0)) && (
          <CarouselRow title={t('dashboard.resumeWatching')} autoScroll={false}>
            {(resumeWatching.length > 0 ? resumeWatching : data.continueWatching || []).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <LazyResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Revoir (déjà terminés) */}
        {rewatchWatching.length > 0 && (
          <CarouselRow title={t('dashboard.rewatch')} autoScroll={false}>
            {rewatchWatching.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
                <LazyResumePoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        <GenreCardsRow
          genres={allGenres}
          genreBackgrounds={genreBackgrounds}
          allBackground="/media-generic.svg"
          selectedGenre={selectedGenre}
          onSelectGenre={setSelectedGenre}
          language={language}
        />

        <section className="mb-3 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <div className="flex items-center gap-3">
            <h3 className="text-sm sm:text-base md:text-lg font-semibold text-white/90 uppercase tracking-wide">
              {t('dashboard.sectionMovies')}
            </h3>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        </section>

        {/* Ligne Nouveautés films (tri par date de sortie) */}
        {!isSyncing && recentMoviesRow.length > 0 && (
          <CarouselRow
            title={t('dashboard.newReleases')}
            autoScroll={false}
          >
            {recentMoviesRow.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Ligne les plus partagés films */}
        {sharedMoviesRow.length > 0 && (
          <CarouselRow
            title={t('dashboard.mostShared')}
            autoScroll={false}
          >
            {sharedMoviesRow.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        <section className="mb-3 mt-2 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
          <div className="flex items-center gap-3">
            <h3 className="text-sm sm:text-base md:text-lg font-semibold text-white/90 uppercase tracking-wide">
              {t('dashboard.sectionSeries')}
            </h3>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        </section>

        {/* Ligne Nouveautés séries */}
        {!isSyncing && recentSeriesRow.length > 0 && (
          <CarouselRow
            title={t('dashboard.newReleases')}
            autoScroll={false}
          >
            {recentSeriesRow.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Ligne les plus partagées séries */}
        {sharedSeriesRow.length > 0 && (
          <CarouselRow
            title={t('dashboard.mostShared')}
            autoScroll={false}
          >
            {sharedSeriesRow.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}
      </div>
    </div>
  );
}
