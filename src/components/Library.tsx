import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';

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
        const existingItems = (response.data as LibraryMedia[]).filter(item => item.exists);
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
      <div class="flex justify-center items-center p-8">
        <span class="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="alert alert-error">
        <span>{error}</span>
        <button class="btn btn-sm" onClick={loadLibrary}>
          Réessayer
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div class="text-center p-8">
        <p class="text-gray-500 text-lg">Votre bibliothèque est vide</p>
        <p class="text-sm text-gray-400 mt-2">
          Les médias téléchargés apparaîtront ici automatiquement
        </p>
      </div>
    );
  }

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
      {items.map((item) => {
        const displayTitle = item.name;
        const poster = item.poster_url || item.hero_image_url;
        const category = item.category || (item.tmdb_type === 'movie' ? 'FILM' : 'SERIES');
        const isMovie = category === 'FILM' || item.tmdb_type === 'movie';

        return (
          <div
            key={item.info_hash}
            class="card bg-base-200 shadow-md hover:shadow-xl transition-shadow cursor-pointer group"
            onClick={() => {
              onItemClick?.(item);
              handlePlay(item);
            }}
          >
            <figure class="aspect-[2/3] bg-base-300 relative overflow-hidden">
              {poster ? (
                <img
                  src={poster}
                  alt={displayTitle}
                  class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              ) : (
                <div class="flex items-center justify-center w-full h-full">
                  <span class="text-4xl">🎬</span>
                </div>
              )}
              {item.resolution && (
                <div class="absolute top-2 right-2">
                  <span class="badge badge-sm badge-primary">{item.resolution}</span>
                </div>
              )}
            </figure>
            <div class="card-body p-3">
              <h3 class="card-title text-sm line-clamp-2 min-h-[2.5rem]">{displayTitle}</h3>
              <div class="flex flex-col gap-2 mt-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-outline text-xs">
                      {isMovie ? 'Film' : 'Série'}
                    </span>
                    {item.is_local_only && (
                      <span class="badge badge-warning badge-sm text-xs" title="Fichier local uniquement (non téléchargé via Popcorn)">
                        📁 Local
                      </span>
                    )}
                    {!item.is_local_only && (
                      <span class="badge badge-success badge-sm text-xs" title="Téléchargé via Popcorn">
                        🍿 Popcorn
                      </span>
                    )}
                  </div>
                  {item.file_size && (
                    <span class="text-xs text-gray-400">
                      {formatFileSize(item.file_size)}
                    </span>
                  )}
                </div>
                {item.quality && (
                  <span class="badge badge-sm badge-secondary text-xs">
                    {item.quality}
                  </span>
                )}
                {item.vote_average && (
                  <div class="flex items-center gap-1">
                    <span class="text-xs">⭐</span>
                    <span class="text-xs">{item.vote_average.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
