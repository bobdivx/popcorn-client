import type { ClientTorrentStats } from '../../../lib/client/types.js';
import type { SeriesEpisodesResponse } from '../../../lib/client/server-api/media.js';

export interface MediaDetailPageProps {
  /** Toutes les variantes du groupe (pour séries, permet de choisir par épisode) */
  initialVariants?: Array<MediaDetailPageProps['torrent']>;
  /** Épisodes par saison (séries uniquement) */
  seriesEpisodes?: SeriesEpisodesResponse | null;
  /** Stats client (librqbit) passées depuis la page Téléchargements pour afficher immédiatement Lire / progression. */
  initialTorrentStats?: ClientTorrentStats | null;
  /** URL de la page d'origine pour le bouton Retour (ex. /library, /dashboard, /discover). */
  backHref?: string | null;
  torrent: {
    id: string;
    slug?: string | null;
    infoHash: string | null;
    name: string;
    cleanTitle?: string; // Titre nettoyé parsé par le backend
    description?: string | null;
    category?: string;
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    trailerKey?: string | null;
    fileSize: number;
    seedCount: number;
    leechCount: number;
    uploader?: string;
    createdAt?: number;
    _externalLink?: string;
    _externalMagnetUri?: string | null;
    _guid?: string | null; // GUID Torznab pour téléchargement via API
    _externalGuid?: string | number; // Alias pour compatibilité
    indexerId?: string | null;
    indexerName?: string | null;
    quality?: {
      resolution?: string;
      source?: string;
      codec?: string;
      audio?: string;
      language?: string;
      full?: string;
    };
    language?: string; // Langue parsée par le backend
    format?: string; // Format parsé par le backend
    codec?: string; // Codec parsé par le backend
    // Données TMDB
    synopsis?: string | null;
    releaseDate?: string | null;
    genres?: string[] | null;
    voteAverage?: number | null;
    runtime?: number | null;
    tmdbId?: number | null;
    tmdbType?: string | null;
    // État du torrent depuis le backend Rust (si disponible)
    clientState?: 'queued' | 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
    clientProgress?: number; // 0.0 à 1.0
    // Chemin du fichier local pour les médias locaux
    downloadPath?: string | null;
    /** En mode démo : URL directe du MP4 (hébergé sur popcorn-web), pour lecture sans HLS. */
    _demoStreamUrl?: string | null;
  };
}

export type PlayStatus = 'idle' | 'adding' | 'downloading' | 'buffering' | 'ready' | 'error';

export type DebugLogType = 'info' | 'success' | 'error' | 'warning';

export interface DebugLog {
  time: string;
  type: DebugLogType;
  message: string;
  data?: any;
}
