export interface HLSPlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentName?: string;
  torrentId?: string;
  filePath?: string;
  /** Pour sauvegarder la position par média (tmdb), reprise même avec un autre info_hash */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  startFromBeginning?: boolean;
  /** Contexte série : afficher overlay « Passer le générique » pendant l'intro */
  isSeries?: boolean;
  /** Épisode suivant (série) : afficher bouton « Épisode suivant » peu avant la fin */
  nextEpisodeInfo?: { seasonNum: number; episodeVariantId: string; title?: string } | null;
  onPlayNextEpisode?: () => void;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Message d’overlay pendant le chargement (ex. pendant retries 503). Null = message par défaut. */
  onLoadingMessageChange?: (message: string | null) => void;
  onBufferProgress?: (percent: number) => void;
  onClose?: () => void;
  /** Désactivé pour local_, UNC et ami pour éviter 503 en boucle (seek natif uniquement). */
  canUseSeekReload?: boolean;
  /** URL du backend de stream (ex. bibliothèque ami). Si absent, utilise l'URL du serveur par défaut. */
  baseUrl?: string;
  /** Flux depuis un serveur distant (ex. bibliothèque partagée) : buffer plus grand et timeouts augmentés. */
  isRemoteStream?: boolean;
  /** Quand défini, les URLs HLS passent par le proxy local /api/remote-stream/proxy (reload seek, etc.). */
  streamBackendUrl?: string | null;
  /** Ref pour exposer stopBuffer (arrêt du buffer à la fermeture), remplace window.__hlsPlayerStopBuffer. */
  stopBufferRef?: import('preact').RefObject<(() => void) | null>;
  /** Hauteur max en pixels pour le transcode (720, 480, 360). null = résolution source. */
  maxHeight?: number | null;
  /** Qualité actuelle affichée (pour le sélecteur). */
  streamQuality?: number | null;
  /** Callback quand l'utilisateur change la qualité dans le player. */
  onQualityChange?: (height: number | null) => void;
}

declare global {
  interface Window {
    Hls?: any;
  }
}
