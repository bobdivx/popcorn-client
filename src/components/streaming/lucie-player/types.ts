export interface LuciePlayerProps {
  src: string; // URL de base pour récupérer les segments et le manifest
  infoHash?: string;
  fileName: string;
  torrentName?: string;
  posterUrl?: string;
  logoUrl?: string;
  synopsis?: string;
  releaseDate?: string;
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
  onBufferProgress?: (percent: number) => void;
  onClose?: () => void;
  /** URL du backend de stream (ex. bibliothèque ami). Si absent, utilise l'URL du serveur par défaut. */
  baseUrl?: string;
  /** Ref pour exposer stopBuffer (arrêt du buffer à la fermeture) */
  stopBufferRef?: import('preact').RefObject<(() => void) | null>;
  /** Appelé périodiquement et à la fermeture avec la progression (pour Reprendre / Revoir). */
  onProgress?: (currentTime: number, duration: number) => void;

  /** Miniatures scrub (type Netflix) — si défini, affiche une vignette au survol de la barre. */
  scrubThumbnails?: {
    mediaId: string;
    count: number;
    durationSeconds?: number;
    intervalSeconds?: number;
  } | null;

  /** Miniatures en cours de génération (placeholder animé). */
  scrubThumbnailsLoading?: boolean;
}

/**
 * Structure du fichier JSON manifest retourné par le serveur
 */
export interface LucieManifest {
  /** Durée totale de la vidéo en secondes */
  duration: number;
  /** Nombre total de segments */
  segmentCount: number;
  /** Durée de chaque segment en secondes (toujours 5s) */
  segmentDuration: number;
  /** Codec vidéo utilisé (ex: "vp9") */
  videoCodec: string;
  /** Codec audio utilisé (ex: "opus") */
  audioCodec: string;
  /** Largeur de la vidéo */
  width: number;
  /** Hauteur de la vidéo */
  height: number;
  /** ID unique du fichier pour le tracking */
  fileId?: string;
}

declare global {
  interface Window {
    MediaSource?: typeof MediaSource;
  }
}
