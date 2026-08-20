/** Plafond HLS si la 4K ne démarre pas (décodeur TV / MSE). */
export const UHD_FALLBACK_HEIGHT = 1080;

/** Playlist / buffer prêts mais pas de `playing`. */
export const UHD_FALLBACK_AFTER_PLAYLIST_MS = 20_000;

/** Overlay bloquée sans playlist (worker HLS, 503 infini). */
export const UHD_FALLBACK_WITHOUT_PLAYLIST_MS = 55_000;

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
}): boolean {
  if (!opts.isUhdAttempt || opts.alreadyFellBack || opts.hasStartedPlayback) return false;
  if (opts.fatalMediaError) return true;
  if (opts.playlistOrBufferReady) return opts.elapsedMs >= UHD_FALLBACK_AFTER_PLAYLIST_MS;
  return opts.elapsedMs >= UHD_FALLBACK_WITHOUT_PLAYLIST_MS;
}
