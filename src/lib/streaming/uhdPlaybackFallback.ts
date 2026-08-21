/** Plafond HLS si la 4K ne démarre pas (décodeur TV / MSE). */
export const UHD_FALLBACK_HEIGHT = 1080;

/** Playlist / buffer prêts mais la tête n’avance pas (1re frame figée ≠ lecture). */
export const UHD_FALLBACK_AFTER_PLAYLIST_MS = 8_000;

/** Overlay bloquée sans playlist (worker HLS, 503 infini). */
export const UHD_FALLBACK_WITHOUT_PLAYLIST_MS = 55_000;

/** Seuil : une vraie lecture, pas juste `videoWidth` / `canplay`. */
export const UHD_PLAYBACK_STARTED_SEC = 1;

export function isUhdQualityAttempt(maxHeight: number | null | undefined): boolean {
  return maxHeight == null || maxHeight > UHD_FALLBACK_HEIGHT;
}

export function shouldFallbackUhdPlayback(opts: {
  isUhdAttempt: boolean;
  alreadyFellBack: boolean;
  hasStartedPlayback: boolean;
  playlistOrBufferReady: boolean;
  elapsedMs: number;
  fatalMediaError: boolean;
  currentTime?: number;
}): boolean {
  if (!opts.isUhdAttempt || opts.alreadyFellBack) return false;
  const head = opts.currentTime ?? 0;
  if (opts.hasStartedPlayback && head >= UHD_PLAYBACK_STARTED_SEC) return false;
  if (head >= UHD_PLAYBACK_STARTED_SEC) return false;
  if (opts.fatalMediaError) return true;
  if (opts.playlistOrBufferReady) return opts.elapsedMs >= UHD_FALLBACK_AFTER_PLAYLIST_MS;
  return opts.elapsedMs >= UHD_FALLBACK_WITHOUT_PLAYLIST_MS;
}
