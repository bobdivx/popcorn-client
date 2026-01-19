import type { MediaDetailPageProps } from '../types';
import { formatSize } from '../utils/formatSize';

interface TorrentInfoProps {
  torrent: MediaDetailPageProps['torrent'];
  seedCount: number;
  leechCount: number;
  fileSize: number;
  sources?: Array<{
    tracker: string;
    seeds: number;
    peers: number;
    quality?: 'Remux' | '4K' | '1080p' | '720p' | '480p';
    codec?: 'x264' | 'x265' | 'AV1';
    fileSize?: number;
  }>;
}

export function TorrentInfo({ torrent, seedCount, leechCount, fileSize, sources }: TorrentInfoProps) {
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

  // Récupérer l'indexer depuis le torrent
  const indexerName = (torrent as any).indexerName || (torrent as any).indexer_name || null;

  return (
    <div className="space-y-4">
      {/* Indexer - Affiché en premier pour les torrents externes */}
      {indexerName && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary-600/30 text-primary-300 rounded-lg text-sm font-semibold glass-panel">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <span>Indexer:</span>
            <span className="text-primary-200 font-bold">{indexerName}</span>
          </div>
        </div>
      )}

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

      {/* Multi-Sources - Agrégation de Trackers */}
      {sources && sources.length > 1 && (
        <div className="mt-6 p-4 tv:p-6 glass-panel rounded-lg border border-white/10">
          <h3 className="text-lg tv:text-xl font-semibold mb-4 text-white">Sources Multiples</h3>
          <div className="space-y-3">
            {sources
              .sort((a, b) => {
                // Trier par qualité (Remux > 4K > 1080p)
                const qualityOrder: Record<string, number> = { Remux: 1000, '4K': 500, '1080p': 300, '720p': 100, '480p': 50 };
                const aQuality = qualityOrder[a.quality || ''] || 0;
                const bQuality = qualityOrder[b.quality || ''] || 0;
                return bQuality - aQuality || b.seeds - a.seeds;
              })
              .map((source, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 tv:p-4 bg-glass hover:bg-glass-hover rounded-lg border border-white/10 transition-all duration-200 glass-panel"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="px-3 py-1 tv:px-4 tv:py-2 bg-primary/20 border border-primary-600/30 text-primary-300 rounded-lg text-xs tv:text-sm font-semibold glass-panel">
                        {source.tracker || torrent.indexerName || 'Tracker'}
                      </span>
                      {source.quality && (
                        <span className="px-3 py-1 tv:px-4 tv:py-2 bg-glass glass-panel border border-white/20 text-white rounded-lg text-xs tv:text-sm font-semibold">
                          {source.quality}
                        </span>
                      )}
                      {source.codec && (
                        <span className="px-3 py-1 tv:px-4 tv:py-2 bg-glass glass-panel border border-white/20 text-white rounded-lg text-xs tv:text-sm font-semibold">
                          {source.codec === 'x265' ? 'H.265' : source.codec === 'x264' ? 'H.264' : source.codec}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs tv:text-sm text-gray-300">
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {source.seeds}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {source.peers}
                      </span>
                      {source.fileSize && (
                        <span>{formatSize(source.fileSize)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Métadonnées techniques */}
      {(torrent.uploader || torrent.indexerName || torrent.createdAt) && (
        <div className="text-sm text-white/70 space-y-2">
          {(torrent.uploader || torrent.indexerName) && (
            <div>
              <span className="font-semibold">Source:</span> {torrent.indexerName || torrent.uploader}
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
