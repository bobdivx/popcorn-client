import { useMemo, useEffect, useRef } from 'preact/hooks';
import { useDashboardData } from './hooks/useDashboardData';
import { useResumeWatching } from './hooks/useResumeWatching';
import { useSyncStatus } from './hooks/useSyncStatus';
import { refreshSyncStatusStore } from '../../lib/sync-status-store';
import type { ContentItem } from '../../lib/client/types';
import CarouselRow from '../torrents/CarouselRow';
import { HeroSection } from './components/HeroSection';
import { LazyResumePoster } from './components/LazyResumePoster';
import { LazyTorrentPoster } from './components/LazyTorrentPoster';
import { SyncCard } from './components/SyncCard';
import { SyncProgress } from '../setup/components/SyncProgress';
import { useI18n } from '../../lib/i18n/useI18n';
import { translateGenre } from '../../lib/utils/genre-translation';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

const MIN_ITEMS_PER_GENRE_ROW = 10;

export default function Dashboard() {
  const { t, language } = useI18n();
  const { data, loading, error, reload, reloadSilent } = useDashboardData();
  const { resumeWatching, rewatchWatching, watchedIds } = useResumeWatching();
  const isWatched = (item: ContentItem) =>
    watchedIds.has(item.id) || (item.tmdbId != null && watchedIds.has(String(item.tmdbId)));
  const { syncStatus, isSyncing, loading: syncLoading } = useSyncStatus();
  const wasSyncingRef = useRef(false);
  const clearedBySyncRef = useRef(false);

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
      <div className="flex justify-center items-center min-h-screen bg-black">
        <HLSLoadingSpinner size="lg" />
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
            Les contenus apparaîtront au fur et à mesure de la synchronisation.
          </p>
        </div>
      </div>
    );
  }

  // Grouper les films par genre principal uniquement (chaque film dans une seule ligne)
  const moviesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularMovies) {
      data.popularMovies.forEach(movie => {
        if (movie.genres && movie.genres.length > 0) {
          // Utiliser uniquement le genre principal (premier du tableau)
          const primaryGenre = movie.genres[0];
          if (!grouped[primaryGenre]) {
            grouped[primaryGenre] = [];
          }
          grouped[primaryGenre].push(movie);
        } else {
          // Films sans genre dans une catégorie "Autres" (clé interne pour i18n)
          const otherKey = '__other__';
          if (!grouped[otherKey]) {
            grouped[otherKey] = [];
          }
          grouped[otherKey].push(movie);
        }
      });
    }

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [data.popularMovies]);

  // Grouper les séries par genre principal uniquement (chaque série dans une seule ligne)
  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, ContentItem[]> = {};
    
    if (data.popularSeries) {
      data.popularSeries.forEach(serie => {
        if (serie.genres && serie.genres.length > 0) {
          // Utiliser uniquement le genre principal (premier du tableau)
          const primaryGenre = serie.genres[0];
          if (!grouped[primaryGenre]) {
            grouped[primaryGenre] = [];
          }
          grouped[primaryGenre].push(serie);
        } else {
          // Séries sans genre dans une catégorie "Autres" (clé interne pour i18n)
          const otherKey = '__other__';
          if (!grouped[otherKey]) {
            grouped[otherKey] = [];
          }
          grouped[otherKey].push(serie);
        }
      });
    }

    // Trier chaque groupe par date (plus récent en premier)
    Object.keys(grouped).forEach(genre => {
      grouped[genre].sort((a, b) => {
        const dateA = a.firstAirDate || a.releaseDate ? new Date(a.firstAirDate || a.releaseDate || '').getTime() : 0;
        const dateB = b.firstAirDate || b.releaseDate ? new Date(b.firstAirDate || b.releaseDate || '').getTime() : 0;
        return dateB - dateA;
      });
    });

    return grouped;
  }, [data.popularSeries]);

  // Trier les genres par ordre alphabétique
  const sortedMovieGenres = Object.keys(moviesByGenre).sort((a, b) => {
    if (a === '__other__') return 1;
    if (b === '__other__') return -1;
    return a.localeCompare(b);
  });
  const sortedSeriesGenres = Object.keys(seriesByGenre).sort((a, b) => {
    if (a === '__other__') return 1;
    if (b === '__other__') return -1;
    return a.localeCompare(b);
  });

  // Genres "assez remplis" pour les films (>= 10 après filtre vu) ; le reste va dans "Autres genres"
  const bigMovieGenres = useMemo(() => {
    return sortedMovieGenres.filter(genre => {
      const list = moviesByGenre[genre] || [];
      const filtered = list.filter((item) => !isWatched(item));
      return filtered.length >= MIN_ITEMS_PER_GENRE_ROW;
    });
  }, [sortedMovieGenres, moviesByGenre, isWatched]);
  const otherMoviesRow = useMemo(() => {
    const seen = new Set<string>();
    sortedMovieGenres.forEach(genre => {
      const list = moviesByGenre[genre] || [];
      const filtered = list.filter((item) => !isWatched(item));
      if (filtered.length > 0 && filtered.length < MIN_ITEMS_PER_GENRE_ROW) {
        filtered.forEach(m => { if (m.id) seen.add(m.id); });
      }
    });
    if (seen.size === 0) return [];
    const all = (data.popularMovies || []).filter(m => m.id && seen.has(m.id) && !isWatched(m));
    return all.sort((a, b) => {
      const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
      const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [sortedMovieGenres, moviesByGenre, data.popularMovies, isWatched]);

  const bigSeriesGenres = useMemo(() => {
    return sortedSeriesGenres.filter(genre => {
      const list = seriesByGenre[genre] || [];
      const filtered = list.filter((item) => !isWatched(item));
      return filtered.length >= MIN_ITEMS_PER_GENRE_ROW;
    });
  }, [sortedSeriesGenres, seriesByGenre, isWatched]);
  const otherSeriesRow = useMemo(() => {
    const seen = new Set<string>();
    sortedSeriesGenres.forEach(genre => {
      const list = seriesByGenre[genre] || [];
      const filtered = list.filter((item) => !isWatched(item));
      if (filtered.length > 0 && filtered.length < MIN_ITEMS_PER_GENRE_ROW) {
        filtered.forEach(s => { if (s.id) seen.add(s.id); });
      }
    });
    if (seen.size === 0) return [];
    const all = (data.popularSeries || []).filter(s => s.id && seen.has(s.id) && !isWatched(s));
    return all.sort((a, b) => {
      const dateA = (a.firstAirDate || a.releaseDate) ? new Date((a.firstAirDate || a.releaseDate) || '').getTime() : 0;
      const dateB = (b.firstAirDate || b.releaseDate) ? new Date((b.firstAirDate || b.releaseDate) || '').getTime() : 0;
      return dateB - dateA;
    });
  }, [sortedSeriesGenres, seriesByGenre, data.popularSeries, isWatched]);

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
        <HeroSection items={heroItems} onPlay={handlePlay} onPrimaryAction={handlePlay} />
      )}

      <div className="pb-8 tv:pb-12">
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

        {/* Ligne Nouveautés films (tri par date de sortie) — masquée pendant la sync torrent ; masquée si vide */}
        {!isSyncing && data.recentMovies && data.recentMovies.filter((item) => !isWatched(item)).length > 0 && (
          <CarouselRow title={t('dashboard.newReleasesMovies')} autoScroll={false}>
            {data.recentMovies.filter((item) => !isWatched(item)).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Ligne Nouveautés séries (tri par date de sortie) — masquée pendant la sync torrent ; masquée si vide */}
        {!isSyncing && data.recentSeries && data.recentSeries.filter((item) => !isWatched(item)).length > 0 && (
          <CarouselRow title={t('dashboard.newReleasesSeries')} autoScroll={false}>
            {data.recentSeries.filter((item) => !isWatched(item)).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Ligne Torrents les plus partagés (beaucoup de seeders) */}
        {data.fastTorrents && data.fastTorrents.filter((item) => !isWatched(item)).length > 0 && (
          <CarouselRow title={t('dashboard.mostShared')} autoScroll={false}>
            {data.fastTorrents.filter((item) => !isWatched(item)).map((item) => (
              <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                <LazyTorrentPoster item={item} />
              </div>
            ))}
          </CarouselRow>
        )}

        {/* Section Films les plus populaires (par genre) */}
        {sortedMovieGenres.length > 0 ? (
          <>
            {bigMovieGenres.map(genre => {
              const genreMovies = moviesByGenre[genre];
              if (genreMovies.length === 0) return null;

              const genreTitle =
                genre === '__other__' ? t('common.others') : translateGenre(genre, language);

              const filteredMovies = genreMovies.filter((item) => !isWatched(item));
              if (filteredMovies.length < MIN_ITEMS_PER_GENRE_ROW) return null;
              return (
                <CarouselRow key={`movies-${genre}`} title={genreTitle} autoScroll={false}>
                  {filteredMovies.map((item) => (
                    <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <LazyTorrentPoster item={item} />
                    </div>
                  ))}
                </CarouselRow>
              );
            })}
            {otherMoviesRow.length >= MIN_ITEMS_PER_GENRE_ROW && (
              <CarouselRow key="movies-other-genres" title={t('dashboard.otherGenres')} autoScroll={false}>
                {otherMoviesRow.map((item) => (
                  <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={item} />
                  </div>
                ))}
              </CarouselRow>
            )}
          </>
        ) : (
          // Si aucun genre, afficher tous les films dans une seule ligne
          data.popularMovies && data.popularMovies.filter((item) => !isWatched(item)).length > 0 && (
            <CarouselRow title={t('dashboard.popularMovies')} autoScroll={false}>
              {data.popularMovies.filter((item) => !isWatched(item)).map((item) => (
                <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <LazyTorrentPoster item={item} />
                </div>
              ))}
            </CarouselRow>
          )
        )}

        {/* Section Séries les plus populaires (par genre) */}
        {sortedSeriesGenres.length > 0 ? (
          <>
            {bigSeriesGenres.map(genre => {
              const genreSeries = seriesByGenre[genre];
              if (genreSeries.length === 0) return null;

              const genreTitle =
                genre === '__other__' ? t('common.others') : translateGenre(genre, language);

              const filteredSeries = genreSeries.filter((item) => !isWatched(item));
              if (filteredSeries.length < MIN_ITEMS_PER_GENRE_ROW) return null;
              return (
                <CarouselRow key={`series-${genre}`} title={genreTitle} autoScroll={false}>
                  {filteredSeries.map((item) => (
                    <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <LazyTorrentPoster item={item} />
                    </div>
                  ))}
                </CarouselRow>
              );
            })}
            {otherSeriesRow.length >= MIN_ITEMS_PER_GENRE_ROW && (
              <CarouselRow key="series-other-genres" title={t('dashboard.otherGenres')} autoScroll={false}>
                {otherSeriesRow.map((item) => (
                  <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                    <LazyTorrentPoster item={item} />
                  </div>
                ))}
              </CarouselRow>
            )}
          </>
        ) : (
          // Si aucun genre, afficher toutes les séries dans une seule ligne
          data.popularSeries && data.popularSeries.filter((item) => !isWatched(item)).length > 0 && (
            <CarouselRow title={t('dashboard.popularSeries')} autoScroll={false}>
              {data.popularSeries.filter((item) => !isWatched(item)).map((item) => (
                <div key={item.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <LazyTorrentPoster item={item} />
                </div>
              ))}
            </CarouselRow>
          )
        )}
      </div>
    </div>
  );
}
