import type { MediaDetailPageProps } from '../types';
import { formatSize } from '../utils/formatSize';
import { useI18n } from '../../../../lib/i18n/useI18n';
import { translateGenres } from '../../../../lib/utils/genre-translation';

interface TorrentInfoProps {
  torrent: MediaDetailPageProps['torrent'];
  seedCount: number;
  leechCount: number;
  fileSize: number;
  showSeederWarning?: boolean;
  sources?: Array<{
    tracker: string;
    seeds: number;
    peers: number;
    quality?: 'Remux' | '4K' | '1080p' | '720p' | '480p';
    codec?: 'x264' | 'x265' | 'AV1';
    fileSize?: number;
  }>;
}

export function TorrentInfo({ torrent, seedCount, leechCount, fileSize, showSeederWarning = true, sources }: TorrentInfoProps) {
  const { language } = useI18n();

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
      {/* Chemin du fichier (média en bibliothèque / local) */}
      {(torrent as any).downloadPath && (
        <div className="mb-4">
          <div className="inline-flex flex-col gap-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">
            <span className="font-semibold text-white/90">
              {language === 'fr' ? 'Chemin du fichier' : 'File path'}
            </span>
            <code className="text-white/80 break-all font-mono text-xs" title={(torrent as any).downloadPath}>
              {(torrent as any).downloadPath}
            </code>
          </div>
        </div>
      )}

      {/* Indexer - Affiché en premier pour les torrents externes */}
      {indexerName && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary-600/30 text-primary-300 rounded-lg text-sm font-semibold glass-panel">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <span>{language === 'fr' ? 'Indexer:' : 'Indexer:'}</span>
            <span className="text-primary-200 font-bold">{indexerName}</span>
          </div>
        </div>
      )}

      {/* Avertissement si peu de seeders */}
      {showSeederWarning && seedCount < 10 && (
        <div className={`mb-4 p-3 rounded-lg flex items-start gap-3 ${
          seedCount === 0 
            ? 'bg-red-900/40 border border-red-500/50' 
            : 'bg-amber-900/40 border border-amber-500/50'
        }`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mt-0.5 flex-shrink-0 ${seedCount === 0 ? 'text-red-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className={`text-sm ${seedCount === 0 ? 'text-red-200' : 'text-amber-200'}`}>
            {seedCount === 0 
              ? (language === 'fr' 
                  ? 'Aucun seeder disponible. Ce torrent est probablement indisponible.' 
                  : 'No seeders available. This torrent is likely unavailable.')
              : (language === 'fr' 
                  ? `Seulement ${seedCount} seeder${seedCount > 1 ? 's' : ''} disponible${seedCount > 1 ? 's' : ''}. Le téléchargement pourrait être lent ou échouer.`
                  : `Only ${seedCount} seeder${seedCount > 1 ? 's' : ''} available. Download may be slow or fail.`)
            }
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="flex flex-wrap gap-6 text-sm mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${
            seedCount >= 50 ? 'text-green-500' 
            : seedCount >= 10 ? 'text-green-500'
            : seedCount >= 1 ? 'text-amber-500'
            : 'text-red-500'
          }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`font-semibold ${
            seedCount >= 50 ? 'text-green-500' 
            : seedCount >= 10 ? 'text-green-500'
            : seedCount >= 1 ? 'text-amber-500'
            : 'text-red-500'
          }`}>{seedCount}</span>
          <span className="text-white/70">{language === 'fr' ? 'seeders' : 'seeders'}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-yellow-500 font-semibold">{leechCount}</span>
          <span className="text-white/70">{language === 'fr' ? 'leechers' : 'leechers'}</span>
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
      {(torrent.uploader || torrent.indexerName || torrent.createdAt) && (
        <div className="text-sm text-white/70 space-y-2">
          {(torrent.uploader || torrent.indexerName) && (
            <div>
              <span className="font-semibold">{language === 'fr' ? 'Source:' : 'Source:'}</span> {torrent.indexerName || torrent.uploader}
            </div>
          )}
          {torrent.createdAt && (
            <div>
              <span className="font-semibold">{language === 'fr' ? 'Date d\'ajout:' : 'Added date:'}</span> {new Date(torrent.createdAt * 1000).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', {
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
