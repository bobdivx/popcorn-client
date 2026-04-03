/** Constantes HTMLMediaElement — https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code */

export type MediaErrorDiagnostics = {
  mediaErrorCode: number | null;
  codeLabel: string;
  mediaMessage: string | null;
  networkState: number;
  readyState: number;
  currentSrc: string;
};

const CODE_TO_LABEL: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
};

export function getMediaErrorDiagnostics(video: HTMLVideoElement): MediaErrorDiagnostics {
  const me = video.error;
  const code = me?.code ?? null;
  const codeLabel =
    code != null ? (CODE_TO_LABEL[code] ?? `MEDIA_ERR_UNKNOWN(${code})`) : 'NO_MEDIA_ERROR';
  return {
    mediaErrorCode: code,
    codeLabel,
    mediaMessage: me?.message ?? null,
    networkState: video.networkState,
    readyState: video.readyState,
    currentSrc: video.currentSrc || video.src || '',
  };
}

export function logVideoPlaybackError(scope: string, video: HTMLVideoElement, extra?: Record<string, unknown>): void {
  const d = getMediaErrorDiagnostics(video);
  console.error(`[${scope}] Erreur lecture vidéo`, {
    ...d,
    networkStateLabel: networkStateLabel(video.networkState),
    readyStateLabel: readyStateLabel(video.readyState),
    ...extra,
  });
}

function networkStateLabel(n: number): string {
  const m: Record<number, string> = {
    0: 'EMPTY',
    1: 'IDLE',
    2: 'LOADING',
    3: 'NO_SOURCE',
  };
  return m[n] ?? String(n);
}

function readyStateLabel(n: number): string {
  const m: Record<number, string> = {
    0: 'HAVE_NOTHING',
    1: 'HAVE_METADATA',
    2: 'HAVE_CURRENT_DATA',
    3: 'HAVE_FUTURE_DATA',
    4: 'HAVE_ENOUGH_DATA',
  };
  return m[n] ?? String(n);
}
