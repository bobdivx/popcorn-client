import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { invalidateLibraryCache } from '../lib/client/server-api/library';
import { LibraryPoster } from './library/LibraryPoster';
import CarouselRow from './torrents/CarouselRow';
import { RefreshCw, Film, Tv, Layers, Server, HardDrive, Users, Folder } from 'lucide-preact';
import { useI18n } from '../lib/i18n/useI18n';
import HLSLoadingSpinner from './ui/HLSLoadingSpinner';
import { getSharedWithMe, logFriendActivity } from '../lib/api/popcorn-web';
import { HeroSection } from './dashboard/components/HeroSection';
import type { ContentItem } from '../lib/client/types';
import { translateGenre } from '../lib/utils/genre-translation';

export type LibraryContentFilter = 'all' | 'movies' | 'series';
export type LibrarySourceFilter = 'all' | 'popcorn' | 'external' | 'shared' | 'local';

/** info_hash type "local_xxx" = UUID local (source externe/scan). Vrai hash = 40 ou 32 hex = téléchargé via Popconn. */
function isPopconnDownloadedInfoHash(infoHash: string | null): boolean {
  if (!infoHash || infoHash.startsWith('local_')) return false;
  const hex = /^[a-fA-F0-9]+$/;
  return (infoHash.length === 40 || infoHash.length === 32) && hex.test(infoHash);
}

function getSourceType(item: LibraryMedia): LibrarySourceFilter {
  if (item.__shared) return 'shared';
  if (item.is_external_source) return 'external';
  if (!item.is_local_only) return 'popcorn';
  if (isPopconnDownloadedInfoHash(item.info_hash ?? null)) return 'popcorn';
  return 'local';
}

/** Ordre de priorité pour l'affichage : Popconn d'abord, puis partagés, externe, local */
function sourceSortOrder(source: LibrarySourceFilter): number {
  switch (source) {
    case 'popcorn': return 0;
    case 'shared': return 1;
    case 'external': return 2;
    case 'local': return 3;
    case 'all': return 4;
  }
}

function isMovie(item: LibraryMedia): boolean {
  return item.category === 'FILM' || item.tmdb_type === 'movie';
}

function isSeries(item: LibraryMedia): boolean {
  return item.category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series';
}

function parseGenres(genres: string | null): string[] {
  if (!genres || !genres.trim()) return [];
  const trimmed = genres.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map((g: unknown) => String(g)) : [];
    } catch {
      return [];
    }
  }
  return trimmed.split(',').map((g) => g.trim()).filter(Boolean);
}

export interface LibraryMedia {
  info_hash: string;
  name: string;
  download_path: string;
  file_size: number | null;
  exists: boolean;
  is_file: boolean;
  is_directory: boolean;
  slug: string | null;
  category: string | null;
  tmdb_id: number | null;
  tmdb_type: string | null;
  poster_url: string | null;
  hero_image_url: string | null;
  synopsis: string | null;
  release_date: string | null;
  genres: string | null;
  vote_average: number | null;
  runtime: number | null;
  quality: string | null;
  resolution: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  language: string | null;
  source_format: string | null;
  is_local_only: boolean;
  /** Vrai si le média provient d'une source externe (NAS, partage réseau). */
  is_external_source?: boolean;
  /** Identifiant de source de bibliothèque (locale ou externe) si applicable. */
  library_source_id?: string | null;
  /** Nom de la source de bibliothèque (pour badge externe). */
  library_source_label?: string | null;
  /** En mode démo : URL directe du MP4 (hébergé sur popcorn-web). */
  demo_stream_url?: string;
  // Métadonnées côté client pour les médias partagés
  __shared?: {
    backendUrl: string;
    ownerId: string;
    friendLabel: string;
    localUserId: string | null;
  };
}

interface LibraryProps {
  onItemClick?: (item: LibraryMedia) => void;
  initialContentFilter?: LibraryContentFilter;
  initialSourceFilter?: LibrarySourceFilter;
  showHero?: boolean;
  showFilters?: boolean;
  showSync?: boolean;
}

export default function Library({
  onItemClick,
  initialContentFilter = 'all',
  initialSourceFilter = 'all',
  showHero = true,
  showFilters = true,
  showSync = true,
}: LibraryProps) {
  const { t, language } = useI18n();
  const lang = language === 'fr' ? 'fr' : 'en';
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [sharedByFriends, setSharedByFriends] = useState<Array<{ friendLabel: string; backendUrl: string; localUserId: string | null; items: LibraryMedia[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [contentFilter, setContentFilter] = useState<LibraryContentFilter>(initialContentFilter);
  const [sourceFilter, setSourceFilter] = useState<LibrarySourceFilter>(initialSourceFilter);

  useEffect(() => {
    loadLibrary();
  }, []);

  // Poll du statut de sync tant qu'un scan est en cours (pour masquer l'animation à la fin)
  useEffect(() => {
    if (!syncInProgress) return;
    const interval = setInterval(async () => {
      const res = await serverApi.getLibrarySyncStatus();
      if (res.success && res.data && !res.data.sync_in_progress) {
        setSyncInProgress(false);
        loadLibrary(); // Rafraîchir la liste après la sync
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [syncInProgress]);

  const loadLibrary = async () => {
    try {
      const isInitialLoad = !initialLoadComplete;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      // Toujours notre backend : ma bibliothèque + on ajoute les médias partagés par les amis (affichage uniquement).
      const [response, statusRes] = await Promise.all([
        serverApi.getLibrary(),
        serverApi.getLibrarySyncStatus(),
      ]);

      if (statusRes.success && statusRes.data?.sync_in_progress) {
        setSyncInProgress(true);
      }

      if (!response.success) {
        setError(response.message || t('errors.generic'));
        return;
      }

      // Toujours mettre à jour la liste quand on a une réponse succès (éviter bibliothèque vide si data mal parsée)
      const list = Array.isArray(response.data) ? (response.data as unknown as LibraryMedia[]) : [];
      setItems(list);

      // Ne pas bloquer l'affichage local sur les backends amis (parfois lents/offline).
      void (async () => {
        const shared = await getSharedWithMe();
        if (!shared || shared.length === 0) {
          setSharedByFriends([]);
          return;
        }

        const sections = await Promise.all(
          shared.map(async (s) => {
            if (!s.backendUrl) return null;
            try {
              const controller = new AbortController();
              const timeoutId = window.setTimeout(() => controller.abort(), 4000);
              const res = await fetch(`${s.backendUrl.replace(/\/$/, '')}/library`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  ...(s.localUserId ? { 'X-User-ID': s.localUserId } : {}),
                } as any,
                signal: controller.signal,
              });
              window.clearTimeout(timeoutId);

              const json = await res.json().catch(() => null);
              const data = json && typeof json === 'object' && 'data' in json ? (json as any).data : json;
              const list = Array.isArray(data) ? (data as LibraryMedia[]) : [];
              const existing = list.filter((it) => it && (it as any).exists);
              const friendLabel = s.email || s.friendId;
              return {
                friendLabel,
                backendUrl: s.backendUrl,
                localUserId: s.localUserId,
                items: existing.map((it) => ({
                  ...it,
                  __shared: {
                    backendUrl: s.backendUrl!,
                    ownerId: s.friendId,
                    friendLabel,
                    localUserId: s.localUserId,
                  },
                })),
              };
            } catch {
              return null;
            }
          })
        );

        const validSections: Array<{
          friendLabel: string;
          backendUrl: string;
          localUserId: string | null;
          items: LibraryMedia[];
        }> = [];
        for (const section of sections) {
          if (section) {
            validSections.push(section);
          }
        }
        setSharedByFriends(validSections);
      })();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      const isInitialLoad = !initialLoadComplete;
      if (isInitialLoad) {
        setLoading(false);
        setInitialLoadComplete(true);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  /** Ouvre la page média détail : priorité TMDB (tmdbId + type), fallback slug/info_hash. On garde toujours notre backend ; pour un média partagé on passe l'URL du serveur ami uniquement pour la lecture. */
  const handlePlay = (item: LibraryMedia) => {
    if (item.__shared?.backendUrl) {
      try {
        void logFriendActivity({
          ownerId: item.__shared.ownerId,
          action: 'stream',
          mediaId: item.tmdb_id != null ? String(item.tmdb_id) : item.info_hash || undefined,
          mediaTitle: item.name || undefined,
        });
      } catch {
        // ignore
      }
    }
    const isSeries = item.category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series';
    const typeParam = isSeries ? 'tv' : 'movie';
    let streamBackend = '';
    if (item.__shared?.backendUrl) {
      streamBackend = `&streamBackendUrl=${encodeURIComponent(item.__shared.backendUrl)}`;
      if (item.info_hash) streamBackend += `&infoHash=${encodeURIComponent(item.info_hash)}`;
      if (item.download_path) streamBackend += `&streamPath=${encodeURIComponent(item.download_path)}`;
      if (item.name) streamBackend += `&title=${encodeURIComponent(item.name)}`;
    }
    // Priorité TMDB : ouvrir par tmdbId + type
    if (item.tmdb_id != null) {
      window.location.href = `/torrents?tmdbId=${item.tmdb_id}&type=${typeParam}&from=library${item.name ? `&title=${encodeURIComponent(item.name)}` : ''}${streamBackend}`;
      return;
    }
    if (item.info_hash) {
      window.location.href = `/torrents?slug=${encodeURIComponent(item.info_hash)}&type=${typeParam}&from=library${streamBackend}`;
    } else if (item.slug) {
      window.location.href = `/torrents?slug=${encodeURIComponent(item.slug)}&type=${typeParam}&from=library${streamBackend}`;
    }
  };

  const handleScanLocalMedia = async () => {
    try {
      setScanning(true);
      setScanMessage(null);
      invalidateLibraryCache();
      
      const response = await serverApi.scanLocalMedia();
      
      if (response.success) {
        setScanMessage(t('library.scanStarted'));
        // Attendre un peu puis recharger la bibliothèque
        setTimeout(() => {
          loadLibrary();
        }, 2000);
      } else {
        setScanMessage(response.message || 'Erreur lors du démarrage du scan');
      }
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setScanning(false);
      // Effacer le message après 5 secondes
      setTimeout(() => {
        setScanMessage(null);
      }, 5000);
    }
  };

  /** Extrait une clé de série depuis le chemin (ex. "series/Nom Série/S01/..." → "Nom Série") pour grouper les épisodes locaux */
  const seriesKeyFromPath = (path: string): string => {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    const idx = normalized.indexOf('/series/');
    if (idx === -1) return path;
    const after = normalized.slice(idx + 8);
    const nextSlash = after.indexOf('/');
    return nextSlash === -1 ? after : after.slice(0, nextSlash);
  };

  /** Clé canonique pour déduplication (même fichier = une seule entrée) */
  const itemDedupKey = (item: LibraryMedia): string => {
    const path = (item.download_path || '').replace(/\\/g, '/').toLowerCase().trim();
    if (path) return path;
    return item.info_hash || item.slug || item.name || '';
  };

  // Tous les items : bibliothèque locale + partagés par amis (dédoublonnés par chemin / info_hash)
  const allExistingItems = useMemo(() => {
    const local = items.filter((item) => item.exists);
    const shared = sharedByFriends.flatMap((s) => s.items);
    const combined = [...local, ...shared];
    const seen = new Set<string>();
    return combined.filter((item) => {
      const key = itemDedupKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [items, sharedByFriends]);

  const allDownloadingItems = useMemo(() => items.filter((item) => !item.exists), [items]);

  // Filtrer par source et type de contenu
  const matchesSource = (item: LibraryMedia) => {
    if (sourceFilter === 'all') return true;
    return getSourceType(item) === sourceFilter;
  };
  const matchesContent = (item: LibraryMedia) => {
    if (contentFilter === 'all') return true;
    if (contentFilter === 'movies') return isMovie(item);
    return isSeries(item);
  };

  const filteredExisting = useMemo(() => {
    const list = allExistingItems.filter((i) => matchesSource(i) && matchesContent(i));
    // Prioriser les médias téléchargés avec Popconn, puis partagés, externe, local
    return [...list].sort(
      (a, b) => sourceSortOrder(getSourceType(a)) - sourceSortOrder(getSourceType(b))
    );
  }, [allExistingItems, sourceFilter, contentFilter]);

  const filteredDownloading = useMemo(
    () => allDownloadingItems.filter(matchesContent),
    [allDownloadingItems, contentFilter]
  );

  // Séparer films / séries (une carte par série, regroupement par tmdb_id ou chemin)
  const { movies, series, others } = useMemo(() => {
    const moviesList: LibraryMedia[] = [];
    const seriesRaw: LibraryMedia[] = [];
    const othersList: LibraryMedia[] = [];

    filteredExisting.forEach((item) => {
      if (isMovie(item)) {
        moviesList.push(item);
      } else if (isSeries(item)) {
        seriesRaw.push(item);
      } else {
        othersList.push(item);
      }
    });

    const seriesByKey = new Map<string, LibraryMedia[]>();
    for (const item of seriesRaw) {
      const key =
        item.tmdb_id != null ? `tmdb_${item.tmdb_id}` : `path_${seriesKeyFromPath(item.download_path)}`;
      const list = seriesByKey.get(key) ?? [];
      list.push(item);
      seriesByKey.set(key, list);
    }
    const seriesList: LibraryMedia[] = [];
    seriesByKey.forEach((list) => {
      const withPoster = list.find((i) => i.poster_url || i.hero_image_url);
      seriesList.push(withPoster ?? list[0]);
    });

    return { movies: moviesList, series: seriesList, others: othersList };
  }, [filteredExisting]);

  // Grouper par genre (premier genre du tableau) pour lignes par genre
  const moviesByGenre = useMemo(() => {
    const grouped: Record<string, LibraryMedia[]> = {};
    movies.forEach((item) => {
      const genres = parseGenres(item.genres);
      const primaryGenre = genres[0];
      const key = primaryGenre && primaryGenre.trim() ? primaryGenre.trim() : '__other__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return grouped;
  }, [movies]);

  const seriesByGenre = useMemo(() => {
    const grouped: Record<string, LibraryMedia[]> = {};
    series.forEach((item) => {
      const genres = parseGenres(item.genres);
      const primaryGenre = genres[0];
      const key = primaryGenre && primaryGenre.trim() ? primaryGenre.trim() : '__other__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return grouped;
  }, [series]);

  const existingItems = filteredExisting;
  const downloadingItems = filteredDownloading;
  const groupedItems = { movies, series, others };

  const heroItems = useMemo<ContentItem[]>(() => {
    const withPoster = existingItems
      .filter((item) => item.poster_url || item.hero_image_url)
      .slice(0, 3)
      .map((item) => ({
        id: item.info_hash || item.slug || item.name,
        title: item.name,
        type:
          item.category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series'
            ? 'tv'
            : 'movie',
        poster: item.poster_url || undefined,
        backdrop: item.hero_image_url || undefined,
        overview: item.synopsis || undefined,
        rating: item.vote_average ?? undefined,
        releaseDate: item.release_date ?? undefined,
        tmdbId: item.tmdb_id ?? undefined,
      }));
    if (withPoster.length > 0) return withPoster;
    // Toujours afficher une image dans le hero : placeholder Bibliothèque
    return [
      {
        id: 'library-placeholder',
        title: t('library.title'),
        type: 'movie' as const,
        poster: '/popcorn_feature_graphic_1024x500.png',
        backdrop: '/popcorn_feature_graphic_1024x500.png',
        overview: t('library.emptyDescription'),
      },
    ];
  }, [existingItems, t]);

  /** Nombre d'items en chargement prioritaire (première ligne visible) par section */
  const PRIORITY_LOAD_COUNT = 12;

  const renderSection = (
    title: string,
    sectionItems: LibraryMedia[],
    options?: { key?: string; priorityFromIndex?: number }
  ) => {
    if (!sectionItems || sectionItems.length === 0) return null;
    const start = options?.priorityFromIndex ?? 0;
    const rowKey = options?.key ?? title;
    return (
      <CarouselRow key={rowKey} title={title} autoScroll={false}>
        {sectionItems.map((item, index) => (
          <div
            key={`${item.info_hash || item.slug || (item.tmdb_id != null ? `series-tmdb-${item.tmdb_id}` : item.name)}-${index}`}
            className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]"
          >
            <LibraryPoster
              item={item}
              onPlay={handlePlay}
              priorityLoad={index >= start && index < start + PRIORITY_LOAD_COUNT}
            />
          </div>
        ))}
      </CarouselRow>
    );
  };

  const renderGridSection = (
    title: string,
    sectionItems: LibraryMedia[],
    options?: { key?: string; priorityFromIndex?: number }
  ) => {
    if (!sectionItems || sectionItems.length === 0) return null;
    const start = options?.priorityFromIndex ?? 0;
    const gridKey = options?.key ?? title;
    return (
      <div key={gridKey} className="mb-8 tv:mb-10 px-4 tv:px-6">
        <h2 className="text-lg sm:text-xl tv:text-2xl font-semibold text-white mb-4">{title}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 tv:grid-cols-6 gap-4 tv:gap-6">
          {sectionItems.map((item, index) => (
            <div
              key={`${item.info_hash || item.slug || (item.tmdb_id != null ? `series-tmdb-${item.tmdb_id}` : item.name)}-${index}`}
              className="w-full"
            >
              <LibraryPoster
                item={item}
                onPlay={handlePlay}
                className="w-full"
                priorityLoad={index >= start && index < start + PRIORITY_LOAD_COUNT}
              />
            </div>
          ))}
        </div>
      </div>
    );
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
          <button className="btn btn-sm btn-ghost border border-white/10 hover:bg-white/10" onClick={loadLibrary}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const hasAnyContent = items.length > 0 || sharedByFriends.some((s) => s.items.length > 0);
  if (!hasAnyContent && syncInProgress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        {/* Barre fine collée au header */}
        <div
          className="library-sync-bar-indeterminate"
          role="progressbar"
          aria-label={t('library.syncInProgress')}
        />
        <div className="text-center max-w-2xl tv:max-w-3xl">
          <HLSLoadingSpinner size="lg" className="mb-6" />
          <h2 className="text-xl tv:text-2xl font-semibold text-white mb-2">{t('library.syncInProgress')}</h2>
          <p className="text-gray-400 text-sm tv:text-base">
            {t('library.emptyDescription')}
          </p>
        </div>
      </div>
    );
  }

  if (!hasAnyContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="text-center max-w-2xl tv:max-w-3xl">
          <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">📚</div>
          <h2 className="text-2xl tv:text-3xl font-bold text-white mb-3 tv:mb-4">{t('library.empty')}</h2>
          <p className="text-gray-400 text-base tv:text-lg">
            {t('library.emptyDescription')}
          </p>
          <div className="mt-6 tv:mt-8">
            <a
              href="/downloads"
              className="btn btn-primary shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600/50 min-h-[48px] tv:min-h-[56px]"
            >
              {t('library.viewDownloads')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const sectionsContent = (
    <>
      {/* 1) En cours de téléchargement en première ligne */}
      {downloadingItems.length > 0 &&
        renderSection(t('library.downloadingSection'), downloadingItems, { key: 'downloading' })}

      {/* 2) Lignes par genre — Films */}
      {(contentFilter === 'all' || contentFilter === 'movies') &&
        Object.entries(moviesByGenre)
          .sort(([a], [b]) => (a === '__other__' ? 1 : b === '__other__' ? -1 : a.localeCompare(b)))
          .map(([genreKey, genreItems]) => {
            const title =
              genreKey === '__other__'
                ? t('library.genreOther')
                : translateGenre(genreKey, lang);
            return renderSection(title, genreItems, {
              key: `movies-${genreKey}`,
            });
          })}

      {/* 3) Lignes par genre — Séries */}
      {(contentFilter === 'all' || contentFilter === 'series') &&
        Object.entries(seriesByGenre)
          .sort(([a], [b]) => (a === '__other__' ? 1 : b === '__other__' ? -1 : a.localeCompare(b)))
          .map(([genreKey, genreItems]) => {
            const title =
              genreKey === '__other__'
                ? t('library.genreOther')
                : translateGenre(genreKey, lang);
            return renderSection(title, genreItems, {
              key: `series-${genreKey}`,
            });
          })}

      {/* 4) Autres (sans genre ou catégorie inconnue) */}
      {groupedItems.others.length > 0 &&
        renderSection(t('library.others'), groupedItems.others, { key: 'others' })}
    </>
  );

  return (
    <div className="pb-8 tv:pb-12">
      {/* Barre fine de chargement collée au header (sync bibliothèque) */}
      {(syncInProgress || isRefreshing) && (
        <div
          className="library-sync-bar-indeterminate"
          role="progressbar"
          aria-label={t('library.syncInProgress')}
        />
      )}

      {/* Hero en premier (toujours une image : médias ou placeholder Bibliothèque) */}
      {showHero && heroItems.length > 0 && (
        <div className="-mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 xl:-mx-12 tv:-mx-16">
          <HeroSection
            items={heroItems}
            onPlay={() => null}
            onPrimaryAction={(item) => {
              if (item.id === 'library-placeholder') return;
              const match = existingItems.find((it) => (it.info_hash || it.slug || it.name) === item.id);
              if (match) handlePlay(match);
            }}
            primaryButtonLabel={t('library.playLatest')}
            primaryActionDisabled={heroItems.length === 1 && heroItems[0].id === 'library-placeholder'}
          />
        </div>
      )}

      {showFilters ? (
        <div className="flex gap-4 tv:gap-6 px-4 tv:px-6">
          {/* Barre verticale (type + source) */}
          <aside className="sticky top-24 self-start z-10">
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex flex-col items-center gap-2 p-2 rounded-full bg-black/60 border border-white/10 shadow-lg backdrop-blur"
                role="tablist"
                aria-label={t('library.title')}
              >
                {(
                  [
                    { id: 'all' as const, label: t('library.filterAll'), icon: Layers },
                    { id: 'movies' as const, label: t('library.filterFilms'), icon: Film },
                    { id: 'series' as const, label: t('library.filterSeries'), icon: Tv },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={contentFilter === id}
                    onClick={() => setContentFilter(id)}
                    className={`group inline-flex items-center justify-center w-11 h-11 tv:w-12 tv:h-12 rounded-full focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-offset-2 focus:ring-offset-black transition-all ${
                      contentFilter === id
                        ? 'bg-white text-black shadow-md'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                    title={label}
                    data-focusable
                  >
                    <Icon className="w-5 h-5 tv:w-6 tv:h-6" />
                    <span className="sr-only">{label}</span>
                  </button>
                ))}
              </div>

              <div
                className="flex flex-col items-center gap-2 p-2 rounded-full bg-black/50 border border-white/10 backdrop-blur"
                aria-label={t('library.filterSourceAll')}
              >
                {(
                  [
                    { id: 'all' as const, label: t('library.filterSourceAll'), icon: Layers },
                    { id: 'popcorn' as const, label: t('library.filterSourcePopcorn'), icon: Server },
                    { id: 'external' as const, label: t('library.filterSourceExternal'), icon: HardDrive },
                    { id: 'shared' as const, label: t('library.filterSourceShared'), icon: Users },
                    { id: 'local' as const, label: t('library.filterSourceLocal'), icon: Folder },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setSourceFilter(id)}
                    className={`inline-flex items-center justify-center w-10 h-10 tv:w-11 tv:h-11 rounded-full focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-offset-2 focus:ring-offset-black transition-colors ${
                      sourceFilter === id
                        ? 'bg-white text-black shadow-sm'
                        : 'bg-white/5 text-white/70 hover:bg-white/15'
                    }`}
                    title={label}
                    data-focusable
                  >
                    <Icon className="w-4.5 h-4.5 tv:w-5 tv:h-5" />
                    <span className="sr-only">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {showSync && (
              <div className="mt-4 mb-6 tv:mb-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    {scanMessage && (
                      <div className={`alert ${scanMessage.includes(t('common.success')) || scanMessage.includes('succès') || scanMessage.includes('success') ? 'alert-success' : 'alert-error'} mb-4`}>
                        <span>{scanMessage}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleScanLocalMedia}
                    disabled={scanning}
                    className="btn btn-primary gap-2 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600"
                    title={t('library.syncLibrary')}
                    data-focusable
                  >
                    <RefreshCw className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
                    {scanning ? t('library.scanning') : t('library.syncLibrary')}
                  </button>
                </div>
              </div>
            )}
            {sectionsContent}
          </div>
        </div>
      ) : (
        <div className="px-4 tv:px-6">
          {showSync && (
            <div className="mt-4 mb-6 tv:mb-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  {scanMessage && (
                    <div className={`alert ${scanMessage.includes(t('common.success')) || scanMessage.includes('succès') || scanMessage.includes('success') ? 'alert-success' : 'alert-error'} mb-4`}>
                      <span>{scanMessage}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleScanLocalMedia}
                  disabled={scanning}
                  className="btn btn-primary gap-2 min-h-[48px] tv:min-h-[56px] focus:outline-none focus:ring-4 focus:ring-primary-600"
                  title={t('library.syncLibrary')}
                  data-focusable
                >
                  <RefreshCw className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
                  {scanning ? t('library.scanning') : t('library.syncLibrary')}
                </button>
              </div>
            </div>
          )}
          {sectionsContent}
        </div>
      )}
    </div>
  );
}
