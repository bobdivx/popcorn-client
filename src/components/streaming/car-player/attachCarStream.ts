import type { RefObject } from 'preact';

type HlsLike = {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

type HlsConstructor = {
  isSupported: () => boolean;
  Events: { ERROR: string };
  DefaultConfig: Record<string, unknown>;
  new (config?: Record<string, unknown>): HlsLike;
};

function applyCarHlsDefaults(HlsClass: HlsConstructor) {
  HlsClass.DefaultConfig.lowLatencyMode = false;
  HlsClass.DefaultConfig.backBufferLength = 90;
  HlsClass.DefaultConfig.maxBufferLength = 60;
}

async function loadHlsClass(): Promise<HlsConstructor | null> {
  if (typeof window === 'undefined') return null;
  const existing = (window as unknown as { Hls?: HlsConstructor }).Hls;
  if (existing) {
    applyCarHlsDefaults(existing);
    return existing;
  }
  try {
    const { default: HlsClass } = await import('hls.js');
    applyCarHlsDefaults(HlsClass as unknown as HlsConstructor);
    (window as unknown as { Hls: HlsConstructor }).Hls = HlsClass as unknown as HlsConstructor;
    return HlsClass as unknown as HlsConstructor;
  } catch (e) {
    console.error('[car-player] Impossible de charger hls.js', e);
    return null;
  }
}

export type CarAttachResult = {
  /** Appeler au unmount / changement de source */
  destroy: () => void;
};

/**
 * Attache une source au `<video>` voiture :
 * - Direct MP4/WebM → `video.src`
 * - HLS → hls.js (MSE) en priorité, sinon HLS natif ; en cas d’échec natif → hls.js
 *
 * Nécessaire pour les MKV : le navigateur ne lit pas le MKV ; le serveur sert un m3u8
 * que Chromium Tesla ne gère souvent pas en natif (MEDIA_ERR_SRC_NOT_SUPPORTED = 4).
 */
export async function attachCarStream(
  video: HTMLVideoElement,
  streamUrl: string,
  mode: 'direct' | 'hls-native' | 'hls',
  onFatalError: (message: string) => void,
): Promise<CarAttachResult> {
  let hls: HlsLike | null = null;
  let cancelled = false;
  let nativeErrorHandler: (() => void) | null = null;

  const destroy = () => {
    cancelled = true;
    if (nativeErrorHandler) {
      video.removeEventListener('error', nativeErrorHandler);
      nativeErrorHandler = null;
    }
    if (hls) {
      try {
        hls.destroy();
      } catch {
        // ignore
      }
      hls = null;
    }
    try {
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore
    }
  };

  const attachWithHlsJs = async (): Promise<boolean> => {
    const HlsClass = await loadHlsClass();
    if (cancelled || !HlsClass) return false;
    if (!HlsClass.isSupported()) return false;

    try {
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore
    }

    hls = new HlsClass({
      enableWorker: true,
      maxBufferLength: 45,
      maxMaxBufferLength: 90,
    });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(HlsClass.Events.ERROR, (...args: unknown[]) => {
      const data = args[1] as { fatal?: boolean; type?: string; details?: string } | undefined;
      if (!data?.fatal) return;
      console.error('[car-player] hls.js fatal', data);
      onFatalError(
        `Lecture HLS impossible (${data.details || data.type || 'erreur'}). Réessayez ou convertissez en MP4.`,
      );
    });
    return true;
  };

  const attachNative = (): void => {
    video.src = streamUrl;
    video.load();
  };

  if (mode === 'direct') {
    attachNative();
    nativeErrorHandler = () => {
      const code = video.error?.code;
      // Direct échoué → souvent mauvais conteneur ; l’appelant peut relancer en HLS
      if (code === 4) {
        onFatalError('Format non supporté en direct (ex. MKV). Passage HLS…');
      } else if (code) {
        onFatalError(`Erreur média (code ${code})`);
      }
    };
    video.addEventListener('error', nativeErrorHandler);
    return { destroy };
  }

  // HLS : préférer hls.js dès que MSE est dispo (Tesla / Chromium)
  const usedHlsJs = await attachWithHlsJs();
  if (cancelled) return { destroy };
  if (usedHlsJs) return { destroy };

  // Fallback natif (Safari / quelques WebKit)
  attachNative();
  nativeErrorHandler = () => {
    const code = video.error?.code;
    if (code === 4) {
      void (async () => {
        if (cancelled) return;
        console.warn('[car-player] HLS natif échoué (code 4), nouvel essai hls.js');
        const ok = await attachWithHlsJs();
        if (!ok && !cancelled) {
          onFatalError(
            'Ce navigateur ne peut pas lire ce flux (MKV/HLS). Erreur 4 = format non supporté.',
          );
        } else if (ok && !cancelled) {
          void video.play().catch(() => undefined);
        }
      })();
      return;
    }
    if (code) onFatalError(`Erreur média (code ${code})`);
  };
  video.addEventListener('error', nativeErrorHandler);

  return { destroy };
}

/** Helpers pour typage Ref dans CarPlayer (évite imports inutiles). */
export type VideoRef = RefObject<HTMLVideoElement>;
