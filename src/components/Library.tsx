import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { FocusableCard } from './ui/FocusableCard';

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
}

interface LibraryProps {
  onItemClick?: (item: LibraryMedia) => void;
}

export default function Library({ onItemClick }: LibraryProps) {
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await serverApi.getLibrary();

      if (!response.success) {
        setError(response.message || 'Erreur lors du chargement de la bibliothèque');
        return;
      }

      if (response.data) {
        // Filtrer uniquement les médias qui existent réellement
        const list = Array.isArray(response.data) ? (response.data as unknown as LibraryMedia[]) : [];
        const existingItems = list.filter(item => item.exists);
        setItems(existingItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (item: LibraryMedia) => {
    if (item.slug) {
      window.location.href = `/torrents/${item.slug}`;
    } else if (item.info_hash) {
      window.location.href = `/player/${item.info_hash}`;
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Taille inconnue';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 tv:py-24">
        <span className="loading loading-spinner loading-lg tv:loading-xl text-primary-600 mb-4"></span>
        <p className="text-gray-400 text-base tv:text-lg">Chargement de la bibliothèque…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error bg-primary-900/20 border border-primary-600/50 text-primary-200 glass-panel">
        <span>{error}</span>
        <button className="btn btn-sm btn-ghost border border-white/10 hover:bg-white/10" onClick={loadLibrary}>
          Réessayer
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 tv:py-28 px-4">
        <div className="text-center max-w-2xl tv:max-w-3xl">
          <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">📚</div>
          <h2 className="text-2xl tv:text-3xl font-bold text-white mb-3 tv:mb-4">Bibliothèque vide</h2>
          <p className="text-gray-400 text-base tv:text-lg">
            Les médias téléchargés apparaîtront ici automatiquement.
          </p>
          <div className="mt-6 tv:mt-8">
            <a
              href="/downloads"
              className="btn btn-primary shadow-primary focus:outline-none focus:ring-4 focus:ring-primary-600/50 min-h-[48px] tv:min-h-[56px]"
            >
              Voir les téléchargements
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 tv:grid-cols-6 gap-4 sm:gap-5 md:gap-6 tv:gap-8">
      {items.map((item) => {
        const displayTitle = item.name;
        const poster = item.poster_url || item.hero_image_url;
        const category = item.category || (item.tmdb_type === 'movie' ? 'FILM' : 'SERIES');
        const isMovie = category === 'FILM' || item.tmdb_type === 'movie';

        return (
          <FocusableCard
            key={item.info_hash}
            className="group"
            tabIndex={0}
            onClick={() => {
              onItemClick?.(item);
              handlePlay(item);
            }}
          >
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
              <div className="relative aspect-[2/3] bg-black/40 overflow-hidden">
                {poster ? (
                  <img
                    src={poster}
                    alt={displayTitle}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <span className="text-4xl tv:text-6xl">🎬</span>
                  </div>
                )}

                {/* Gradient lisibilité */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

                {item.resolution ? (
                  <div className="absolute top-2 right-2 tv:top-3 tv:right-3">
                    <span className="badge badge-sm badge-primary">{item.resolution}</span>
                  </div>
                ) : null}
              </div>

              <div className="p-3 tv:p-4">
                <h3 className="text-sm tv:text-base font-semibold text-white line-clamp-2 min-h-[2.5rem] tv:min-h-[3rem]">
                  {displayTitle}
                </h3>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="badge badge-outline text-xs tv:text-sm">{isMovie ? 'Film' : 'Série'}</span>
                  {item.is_local_only ? (
                    <span className="badge badge-warning badge-sm text-xs tv:text-sm" title="Fichier local uniquement">
                      📁 Local
                    </span>
                  ) : (
                    <span className="badge badge-success badge-sm text-xs tv:text-sm" title="Téléchargé via Popcorn">
                      🍿 Popcorn
                    </span>
                  )}
                  {item.quality ? (
                    <span className="badge badge-secondary badge-sm text-xs tv:text-sm">{item.quality}</span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between mt-2 text-xs tv:text-sm text-gray-300">
                  {item.vote_average ? (
                    <span className="flex items-center gap-1">
                      <span>⭐</span>
                      <span>{item.vote_average.toFixed(1)}</span>
                    </span>
                  ) : (
                    <span className="opacity-70"> </span>
                  )}
                  {item.file_size ? <span className="opacity-80">{formatFileSize(item.file_size)}</span> : null}
                </div>
              </div>
            </div>
          </FocusableCard>
        );
      })}
    </div>
  );
}
