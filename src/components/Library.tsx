import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { LibraryPoster } from './library/LibraryPoster';
import CarouselRow from './torrents/CarouselRow';
import { RefreshCw } from 'lucide-preact';
import { useI18n } from '../lib/i18n/useI18n';
import HLSLoadingSpinner from './ui/HLSLoadingSpinner';
import { getSharedWithMe, logFriendActivity } from '../lib/api/popcorn-web';
import { setBackendUrl } from '../lib/backend-config';
import { HeroSection } from './dashboard/components/HeroSection';
import type { ContentItem } from '../lib/client/types';

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
}

export default function Library({ onItemClick }: LibraryProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [sharedByFriends, setSharedByFriends] = useState<Array<{ friendLabel: string; backendUrl: string; localUserId: string | null; items: LibraryMedia[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);

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
      setLoading(true);
      setError(null);

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

      if (response.data) {
        // Filtrer uniquement les médias qui existent réellement
        const list = Array.isArray(response.data) ? (response.data as unknown as LibraryMedia[]) : [];
        const existingItems = list.filter(item => item.exists);
        setItems(existingItems);
      }

      // Charger les médias partagés par des amis (depuis popcorn-web)
      const shared = await getSharedWithMe();
      if (shared && shared.length > 0) {
        const sections: Array<{ friendLabel: string; backendUrl: string; localUserId: string | null; items: LibraryMedia[] }> = [];
        for (const s of shared) {
          if (!s.backendUrl) continue;
          try {
            const res = await fetch(`${s.backendUrl.replace(/\/$/, '')}/library`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                ...(s.localUserId ? { 'X-User-ID': s.localUserId } : {}),
              } as any,
            });
            const json = await res.json().catch(() => null);
            const data = json && typeof json === 'object' && 'data' in json ? (json as any).data : json;
            const list = Array.isArray(data) ? (data as LibraryMedia[]) : [];
            const existing = list.filter((it) => it && (it as any).exists);
            const friendLabel = s.email || s.friendId;
            sections.push({
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
            });
          } catch {
            // ignore: backend ami indisponible
          }
        }
        setSharedByFriends(sections);
      } else {
        setSharedByFriends([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  /** Ouvre la page média détail (torrents) : tmdbId pour les séries identifiées, sinon slug/info_hash */
  const handlePlay = (item: LibraryMedia) => {
    // Si c'est un média partagé, basculer l'URL backend avant la lecture
    if (item.__shared?.backendUrl) {
      try {
        // Activité (non bloquant) : informer le propriétaire que l'ami a démarré un stream
        void logFriendActivity({
          ownerId: item.__shared.ownerId,
          action: 'stream',
          mediaId: item.info_hash || undefined,
          mediaTitle: item.name || undefined,
        });
        setBackendUrl(item.__shared.backendUrl);
      } catch {
        // ignore
      }
    }
    const isSeries = item.category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series';
    // Séries avec tmdb_id : ouvrir la page détail via tmdbId (épisodes, saisons, etc.)
    if (isSeries && item.tmdb_id != null) {
      window.location.href = `/torrents?tmdbId=${item.tmdb_id}&type=tv`;
      return;
    }
    // Pour les médias de la bibliothèque, prioriser l'info_hash car c'est l'identifiant unique
    // du torrent téléchargé. Le slug peut exister mais ne pas avoir de variants dans la DB.
    // MediaDetailRoute peut gérer à la fois les slugs et les info_hash.
    if (item.info_hash) {
      window.location.href = `/torrents?slug=${encodeURIComponent(item.info_hash)}`;
    } else if (item.slug) {
      window.location.href = `/torrents?slug=${encodeURIComponent(item.slug)}`;
    }
  };

  const handleScanLocalMedia = async () => {
    try {
      setScanning(true);
      setScanMessage(null);
      
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

  // Grouper les items par catégorie ; pour les séries, une seule carte par série (regroupement par tmdb_id ou par chemin)
  const groupedItems = useMemo(() => {
    const movies: LibraryMedia[] = [];
    const seriesRaw: LibraryMedia[] = [];
    const others: LibraryMedia[] = [];

    items.forEach((item) => {
      const category = item.category || (item.tmdb_type === 'movie' ? 'FILM' : 'SERIES');
      if (category === 'FILM' || item.tmdb_type === 'movie') {
        movies.push(item);
      } else if (category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series') {
        seriesRaw.push(item);
      } else {
        others.push(item);
      }
    });

    // Une carte par série : grouper par tmdb_id si présent, sinon par seriesKeyFromPath(download_path)
    const seriesByKey = new Map<string, LibraryMedia[]>();
    for (const item of seriesRaw) {
      const key =
        item.tmdb_id != null ? `tmdb_${item.tmdb_id}` : `path_${seriesKeyFromPath(item.download_path)}`;
      const list = seriesByKey.get(key) ?? [];
      list.push(item);
      seriesByKey.set(key, list);
    }
    // Représentant par série : premier avec poster, sinon premier de la liste
    const series: LibraryMedia[] = [];
    seriesByKey.forEach((list) => {
      const withPoster = list.find((i) => i.poster_url || i.hero_image_url);
      series.push(withPoster ?? list[0]);
    });

    return { movies, series, others };
  }, [items]);

  const heroItems = useMemo<ContentItem[]>(() => {
    if (items.length === 0) return [];
    return items
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
  }, [items]);

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
            key={item.tmdb_id != null ? `series-tmdb-${item.tmdb_id}` : item.info_hash}
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
              key={item.tmdb_id != null ? `series-tmdb-${item.tmdb_id}` : item.info_hash}
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

  if (items.length === 0 && syncInProgress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        {/* Barre fine collée au header */}
        <div
          className="library-sync-bar-indeterminate fixed left-0 right-0 z-40 h-[3px] bg-primary-900/80 top-[3.75rem] sm:top-20 md:top-[5.5rem] lg:top-24 2xl:top-28"
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

  if (items.length === 0) {
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

  return (
    <div className="pb-8 tv:pb-12">
      {/* Barre fine de chargement collée au header (sync bibliothèque) */}
      {syncInProgress && (
        <div
          className="library-sync-bar-indeterminate fixed left-0 right-0 z-40 h-[3px] bg-primary-900/80 top-[3.75rem] sm:top-20 md:top-[5.5rem] lg:top-24 2xl:top-28"
          role="progressbar"
          aria-label={t('library.syncInProgress')}
        />
      )}
      {/* Bouton de synchronisation (focusable pour TV) */}
      <div className="mb-6 tv:mb-8 px-4 tv:px-6">
        <div className="flex items-center justify-between">
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

      {/* Hero style dashboard avec derniers téléchargements */}
      {heroItems.length > 0 && (
        <HeroSection
          items={heroItems}
          onPlay={() => null}
          onPrimaryAction={(item) => {
            const match = items.find((it) => (it.info_hash || it.slug || it.name) === item.id);
            if (match) handlePlay(match);
          }}
          primaryButtonLabel={t('library.playLatest')}
        />
      )}

      {/* Films en grille (plusieurs lignes) */}
      {renderGridSection(t('library.films'), groupedItems.movies)}

      {/* Sections en carrousels (style dashboard) */}
      {renderSection(t('library.series'), groupedItems.series)}
      {renderSection(t('library.others'), groupedItems.others)}
      {sharedByFriends.map((section) =>
        renderSection(t('library.sharedBy', { name: section.friendLabel }), section.items, {
          key: section.backendUrl,
        })
      )}
    </div>
  );
}
