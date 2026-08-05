/**
 * Dérivation unique des phases lecture / téléchargement.
 * Une seule source de vérité pour overlays, actions, chips et cartes Downloads.
 */

export type PlaybackPhase =
  | 'idle'
  | 'resolving'
  | 'findingPeers'
  | 'downloading'
  | 'preparingPlayback'
  | 'buffering'
  | 'ready'
  | 'error';

export type PlayStatusLike =
  | 'idle'
  | 'adding'
  | 'downloading'
  | 'buffering'
  | 'ready'
  | 'error'
  | 'starting'
  | string;

export interface PlaybackStatsLike {
  progress?: number | null;
  state?: string | null;
  download_speed?: number | null;
  downloaded_bytes?: number | null;
  total_bytes?: number | null;
  eta_seconds?: number | null;
  peers_connected?: number | null;
  peers_total?: number | null;
  seeders?: number | null;
  files_available?: boolean | null;
}

export interface DerivePlaybackPhaseInput {
  playStatus?: PlayStatusLike | null;
  torrentStats?: PlaybackStatsLike | null;
  /** Lecteur en attente HLS / FFmpeg / stream-ready. */
  isHlsPreparing?: boolean;
  /** Buffer vidéo insuffisant pendant la lecture. */
  isBuffering?: boolean;
  /** Fichiers vidéo déjà résolus côté UI. */
  hasVideoFiles?: boolean;
  /** Message d'erreur explicite. */
  errorMessage?: string | null;
  /** true si l'utilisateur a lancé une action (télécharger / lire). */
  isActiveSession?: boolean;
}

export interface DerivedPlaybackPhase {
  phase: PlaybackPhase;
  /** Progression fiable 0–100, ou null si inconnue. */
  progressPercent: number | null;
  /** true seulement si vraiment terminé (pas un faux 99%). */
  isReallyComplete: boolean;
  isActivelyDownloading: boolean;
  showProgressRing: boolean;
  showTorrentMetrics: boolean;
  /** Étape 1–4 pour l'indicateur compact. */
  stepIndex: number;
  peersConnected: number | null;
  peersTotal: number | null;
  downloadSpeed: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  etaSeconds: number | null;
}

/** Clés i18n playback.phase.* */
export const PLAYBACK_PHASE_I18N_KEYS: Record<PlaybackPhase, string> = {
  idle: 'playback.phase.idle',
  resolving: 'playback.phase.resolving',
  findingPeers: 'playback.phase.findingPeers',
  downloading: 'playback.phase.downloading',
  preparingPlayback: 'playback.phase.preparingPlayback',
  buffering: 'playback.phase.buffering',
  ready: 'playback.phase.ready',
  error: 'playback.phase.error',
};

export function computeReliableProgressPercent(stats: PlaybackStatsLike | null | undefined): number | null {
  if (!stats) return null;
  const total = typeof stats.total_bytes === 'number' && stats.total_bytes > 0 ? stats.total_bytes : null;
  const downloaded = typeof stats.downloaded_bytes === 'number' ? stats.downloaded_bytes : null;
  const apiProgress =
    typeof stats.progress === 'number' && Number.isFinite(stats.progress)
      ? Math.max(0, Math.min(1, stats.progress))
      : null;

  if (total != null && downloaded != null) {
    const fromBytes = Math.max(0, Math.min(1, downloaded / total));
    const merged = apiProgress != null ? Math.min(apiProgress, fromBytes) : fromBytes;
    return Math.round(merged * 1000) / 10;
  }
  if (apiProgress != null) {
    return Math.round(apiProgress * 1000) / 10;
  }
  return null;
}

/**
 * Terminaison fiable : state completed/seeding, ou files_available + fichiers UI.
 * Ne jamais se fier à progress >= 0.99 seul.
 */
export function isTorrentReallyComplete(
  stats: PlaybackStatsLike | null | undefined,
  opts?: { hasVideoFiles?: boolean },
): boolean {
  if (!stats) return false;
  const state = (stats.state || '').toLowerCase();
  if (state === 'completed' || state === 'seeding') return true;
  if (stats.files_available === true && opts?.hasVideoFiles) return true;
  return false;
}

function mapPlayStatusToPhase(playStatus: PlayStatusLike | null | undefined): PlaybackPhase | null {
  if (!playStatus || playStatus === 'idle') return null;
  if (playStatus === 'error') return 'error';
  if (playStatus === 'adding' || playStatus === 'starting') return 'resolving';
  if (playStatus === 'buffering') return 'buffering';
  if (playStatus === 'ready') return 'ready';
  if (playStatus === 'downloading') return 'downloading';
  return null;
}

/**
 * Dérive la phase d'affichage + métriques fiables.
 */
export function derivePlaybackPhase(input: DerivePlaybackPhaseInput): DerivedPlaybackPhase {
  const stats = input.torrentStats ?? null;
  const progressPercent = computeReliableProgressPercent(stats);
  const isReallyComplete = isTorrentReallyComplete(stats, { hasVideoFiles: input.hasVideoFiles });
  const state = (stats?.state || '').toLowerCase();
  const speed = typeof stats?.download_speed === 'number' ? stats.download_speed : 0;
  const peers = typeof stats?.peers_connected === 'number' ? stats.peers_connected : 0;
  const totalBytes = typeof stats?.total_bytes === 'number' ? stats.total_bytes : 0;
  const hasError = Boolean(input.errorMessage) || input.playStatus === 'error' || state === 'error';

  let phase: PlaybackPhase = 'idle';
  const fromStatus = mapPlayStatusToPhase(input.playStatus);

  if (hasError) {
    phase = 'error';
  } else if (input.isBuffering && (input.isActiveSession || fromStatus === 'ready' || isReallyComplete)) {
    phase = 'buffering';
  } else if (
    input.isHlsPreparing &&
    (isReallyComplete || input.hasVideoFiles || fromStatus === 'ready' || fromStatus === 'downloading')
  ) {
    // Préparation lecture seulement si le DL est fini (ou stream mode avec fichiers)
    phase =
      isReallyComplete || input.hasVideoFiles || fromStatus === 'ready'
        ? 'preparingPlayback'
        : speed <= 0 && peers <= 0
          ? 'findingPeers'
          : 'downloading';
  } else if (isReallyComplete) {
    phase = 'ready';
  } else if (
    fromStatus === 'resolving' ||
    state === 'queued' ||
    (totalBytes === 0 && (input.playStatus === 'adding' || input.playStatus === 'downloading'))
  ) {
    phase = 'resolving';
  } else if (
    fromStatus === 'downloading' ||
    state === 'downloading' ||
    speed > 0 ||
    (progressPercent != null && progressPercent > 0 && progressPercent < 99)
  ) {
    phase =
      speed <= 0 && peers <= 0 && (progressPercent == null || progressPercent < 5)
        ? 'findingPeers'
        : 'downloading';
  } else if (fromStatus === 'ready') {
    phase = 'ready';
  } else if (input.isActiveSession || input.playStatus === 'adding') {
    phase = 'resolving';
  } else {
    phase = 'idle';
  }

  const isActivelyDownloading =
    !isReallyComplete &&
    (phase === 'downloading' ||
      phase === 'findingPeers' ||
      speed > 0 ||
      (progressPercent != null && progressPercent > 0 && progressPercent < 99.5));

  const stepIndex =
    phase === 'resolving'
      ? totalBytes > 0
        ? 2
        : 1
      : phase === 'findingPeers'
        ? 3
        : phase === 'downloading'
          ? 4
          : phase === 'preparingPlayback' || phase === 'buffering'
            ? 4
            : phase === 'ready'
              ? 4
              : 0;

  const showProgressRing =
    phase === 'downloading' ||
    phase === 'findingPeers' ||
    phase === 'preparingPlayback' ||
    phase === 'buffering' ||
    phase === 'resolving';

  const showTorrentMetrics =
    (phase === 'downloading' || phase === 'findingPeers' || phase === 'preparingPlayback') &&
    stats != null &&
    (progressPercent != null || totalBytes > 0 || speed > 0 || peers > 0);

  return {
    phase,
    progressPercent,
    isReallyComplete,
    isActivelyDownloading,
    showProgressRing,
    showTorrentMetrics,
    stepIndex,
    peersConnected: typeof stats?.peers_connected === 'number' ? stats.peers_connected : null,
    peersTotal: typeof stats?.peers_total === 'number' ? stats.peers_total : null,
    downloadSpeed: typeof stats?.download_speed === 'number' ? stats.download_speed : null,
    downloadedBytes: typeof stats?.downloaded_bytes === 'number' ? stats.downloaded_bytes : null,
    totalBytes: typeof stats?.total_bytes === 'number' ? stats.total_bytes : null,
    etaSeconds: typeof stats?.eta_seconds === 'number' ? stats.eta_seconds : null,
  };
}
