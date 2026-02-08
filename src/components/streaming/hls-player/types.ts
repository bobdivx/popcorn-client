export interface HLSPlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentName?: string;
  torrentId?: string;
  filePath?: string;
  startFromBeginning?: boolean;
  /** Contexte série : afficher overlay « Passer le générique » pendant l'intro */
  isSeries?: boolean;
  /** Épisode suivant (série) : afficher bouton « Épisode suivant » peu avant la fin */
  nextEpisodeInfo?: { seasonNum: number; episodeVariantId: string; title?: string } | null;
  onPlayNextEpisode?: () => void;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    Hls?: any;
  }
}
