import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import CarouselRow from './torrents/CarouselRow';
import { LibraryPoster } from './library/LibraryPoster';
import { RefreshCw } from 'lucide-preact';

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
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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
    // Pour les médias de la bibliothèque, prioriser l'info_hash car c'est l'identifiant unique
    // du torrent téléchargé. Le slug peut exister mais ne pas avoir de variants dans la DB.
    // MediaDetailRoute peut gérer à la fois les slugs et les info_hash.
    if (item.info_hash) {
      // Utiliser l'info_hash en priorité pour les médias de la bibliothèque
      window.location.href = `/torrents?slug=${encodeURIComponent(item.info_hash)}`;
    } else if (item.slug) {
      // Fallback sur le slug si l'info_hash n'est pas disponible
      window.location.href = `/torrents?slug=${encodeURIComponent(item.slug)}`;
    }
  };

  const handleScanLocalMedia = async () => {
    try {
      setScanning(true);
      setScanMessage(null);
      
      const response = await serverApi.scanLocalMedia();
      
      if (response.success) {
        setScanMessage('Scan démarré avec succès. La bibliothèque sera mise à jour automatiquement.');
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

  // Grouper les items par catégorie
  const groupedItems = useMemo(() => {
    const movies: LibraryMedia[] = [];
    const series: LibraryMedia[] = [];
    const others: LibraryMedia[] = [];

    items.forEach((item) => {
      const category = item.category || (item.tmdb_type === 'movie' ? 'FILM' : 'SERIES');
      if (category === 'FILM' || item.tmdb_type === 'movie') {
        movies.push(item);
      } else if (category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series') {
        series.push(item);
      } else {
        others.push(item);
      }
    });

    return { movies, series, others };
  }, [items]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-black">
        <span className="loading loading-spinner loading-lg text-white"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
        <div className="alert alert-error max-w-2xl">
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost border border-white/10 hover:bg-white/10" onClick={loadLibrary}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
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
    <div className="pb-8 tv:pb-12">
      {/* Bouton de synchronisation */}
      <div className="mb-6 tv:mb-8 px-4 tv:px-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {scanMessage && (
              <div className={`alert ${scanMessage.includes('succès') ? 'alert-success' : 'alert-error'} mb-4`}>
                <span>{scanMessage}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleScanLocalMedia}
            disabled={scanning}
            className="btn btn-primary gap-2 min-h-[48px] tv:min-h-[56px]"
            title="Scanner les fichiers locaux et enrichir avec TMDB"
          >
            <RefreshCw className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scan en cours...' : 'Synchroniser la bibliothèque'}
          </button>
        </div>
      </div>

      {/* Section Films */}
      {groupedItems.movies.length > 0 && (
        <CarouselRow title="Films">
          {groupedItems.movies.map((item) => (
            <div key={item.info_hash} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
              <LibraryPoster item={item} onPlay={handlePlay} />
            </div>
          ))}
        </CarouselRow>
      )}

      {/* Section Séries */}
      {groupedItems.series.length > 0 && (
        <CarouselRow title="Séries">
          {groupedItems.series.map((item) => (
            <div key={item.info_hash} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
              <LibraryPoster item={item} onPlay={handlePlay} />
            </div>
          ))}
        </CarouselRow>
      )}

      {/* Section Autres */}
      {groupedItems.others.length > 0 && (
        <CarouselRow title="Autres">
          {groupedItems.others.map((item) => (
            <div key={item.info_hash} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] relative">
              <LibraryPoster item={item} onPlay={handlePlay} />
            </div>
          ))}
        </CarouselRow>
      )}
    </div>
  );
}
