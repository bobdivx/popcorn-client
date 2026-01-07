import type { MediaDetailPageProps } from '../types';
import { formatSize } from '../utils/formatSize';

interface TorrentInfoProps {
  torrent: MediaDetailPageProps['torrent'];
  seedCount: number;
  leechCount: number;
  fileSize: number;
}

export function TorrentInfo({ torrent, seedCount, leechCount, fileSize }: TorrentInfoProps) {
  // Utiliser le synopsis TMDB si disponible, sinon la description
  const description = torrent.synopsis || torrent.description;

  // Formater la date de sortie
  const formatReleaseDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Formater la durée
  const formatRuntime = (runtime: number | null | undefined): string | null => {
    if (!runtime) return null;
    if (torrent.category === 'series') {
      return `${runtime} épisode${runtime > 1 ? 's' : ''}`;
    }
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours > 0) {
      return `${hours}h${minutes > 0 ? `${minutes}min` : ''}`;
    }
    return `${minutes}min`;
  };

  return (
    <div className="space-y-4">
      {/* Statistiques */}
      <div className="flex flex-wrap gap-6 text-sm mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-green-500 font-semibold">{seedCount}</span>
          <span className="text-white/70">seeders</span>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-yellow-500 font-semibold">{leechCount}</span>
          <span className="text-white/70">leechers</span>
        </div>
        <div className="text-white/70">
          {formatSize(fileSize)}
        </div>
        {torrent.voteAverage && (
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span className="text-yellow-400 font-semibold">{torrent.voteAverage.toFixed(1)}</span>
            <span className="text-white/70">/10</span>
          </div>
        )}
      </div>

      {/* Métadonnées TMDB */}
      {(torrent.releaseDate || torrent.genres || torrent.runtime) && (
        <div className="flex flex-wrap gap-4 text-sm text-white/80 mb-4">
          {torrent.releaseDate && (
            <div>
              <span className="font-semibold text-white/90">Date de sortie:</span> {formatReleaseDate(torrent.releaseDate)}
            </div>
          )}
          {torrent.runtime && (
            <div>
              <span className="font-semibold text-white/90">Durée:</span> {formatRuntime(torrent.runtime)}
            </div>
          )}
          {torrent.genres && torrent.genres.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white/90">Genres:</span>
              <div className="flex flex-wrap gap-2">
                {torrent.genres.map((genre, index) => (
                  <span key={index} className="badge badge-outline badge-sm">
                    {genre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Synopsis/Description */}
      {description && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2 text-white/90">Synopsis</h3>
          <p className="text-lg text-white/90 leading-relaxed max-w-3xl">
            {description}
          </p>
        </div>
      )}

      {/* Métadonnées techniques */}
      {(torrent.uploader || torrent.createdAt) && (
        <div className="text-sm text-white/70 space-y-2">
          {torrent.uploader && (
            <div>
              <span className="font-semibold">Source:</span> {torrent.uploader}
            </div>
          )}
          {torrent.createdAt && (
            <div>
              <span className="font-semibold">Date d'ajout:</span> {new Date(torrent.createdAt * 1000).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
