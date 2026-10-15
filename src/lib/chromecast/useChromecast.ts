import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { isTVPlatform, isWebOSTV } from '../utils/device-detection';

declare global {
  interface Window {
    cast?: any;
    chrome?: any;
  }
}

/**
 * Hook Chromecast (Google Cast) pour les lecteurs vidéo.
 * - Charge le Web Sender SDK
 * - Active `isAvailable` dès que le SDK est prêt
 * - Fournit `castMedia(src, title, currentTime)` → Promise<boolean>
 */
export interface UseChromecastReturn {
  isAvailable: boolean;
  isCasting: boolean;
  castMedia: (src: string, title: string, currentTime: number) => Promise<boolean>;
  stopCasting: () => void;
}

const CAST_SENDER_SCRIPT_URL = '//www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
/** Default Media Receiver Google (non personnalisable). Remplacé par PUBLIC_CAST_RECEIVER_APP_ID. */
const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845';

let castSdkPromise: Promise<void> | null = null;
let castListenersAttached = false;

function getReceiverApplicationId(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? String((import.meta as any).env?.PUBLIC_CAST_RECEIVER_APP_ID || '').trim()
      : '';
  return fromEnv || DEFAULT_MEDIA_RECEIVER_APP_ID;
}

function toAbsoluteMediaUrl(src: string): string {
  if (!src) return src;
  try {
    return new URL(src, typeof window !== 'undefined' ? window.location.href : undefined).href;
  } catch {
    return src;
  }
}

function getContentTypeFromUrl(src: string): string {
  const u = src.split('?')[0].toLowerCase();
  if (u.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (u.endsWith('.mpd')) return 'application/dash+xml';
  if (u.endsWith('.mp4') || u.endsWith('.m4v')) return 'video/mp4';
  if (u.endsWith('.webm')) return 'video/webm';
  if (u.endsWith('.mkv')) return 'video/mp4'; // Fallback (Cast ne supporte pas forcément mkv directement)
  return 'video/mp4';
}

function syncIsCastingFromContext(context: any, castAny: any, setIsCasting: (v: boolean) => void) {
  const castState = context.getCastState?.();
  const sessionState = context.getSessionState?.();
  const connected = castState === castAny.framework.CastState?.CONNECTED;
  const connecting = castState === castAny.framework.CastState?.CONNECTING;
  const sessionLive =
    sessionState === castAny.framework.SessionState?.SESSION_STARTED ||
    sessionState === castAny.framework.SessionState?.SESSION_RESUMED;
  setIsCasting(Boolean(connected || connecting || sessionLive));
}

function ensureCastSdkLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  if (castSdkPromise) return castSdkPromise;

  castSdkPromise = new Promise<void>((resolve, reject) => {
    if (window.cast?.framework?.CastContext) {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[src="${CAST_SENDER_SCRIPT_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      const start = Date.now();
      const interval = window.setInterval(() => {
        if (window.cast?.framework?.CastContext) {
          window.clearInterval(interval);
          resolve();
          return;
        }
        if (Date.now() - start > 15000) {
          window.clearInterval(interval);
          reject(new Error('Cast SDK timeout'));
        }
      }, 150);
      return;
    }

    const script = document.createElement('script');
    script.src = CAST_SENDER_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const start = Date.now();
      const interval = window.setInterval(() => {
        if (window.cast?.framework?.CastContext) {
          window.clearInterval(interval);
          resolve();
          return;
        }
        if (Date.now() - start > 15000) {
          window.clearInterval(interval);
          reject(new Error('Cast SDK timeout (post-load)'));
        }
      }, 150);
    };
    script.onerror = () => reject(new Error('Failed to load Cast SDK'));
    document.head.appendChild(script);
  });

  return castSdkPromise;
}

export function useChromecast(): UseChromecastReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Cast sender inutile / trompeur sur TV (webOS etc.) — on est déjà sur le téléviseur.
    if (isTVPlatform() || isWebOSTV()) {
      setIsAvailable(false);
      return () => {
        mountedRef.current = false;
      };
    }

    ensureCastSdkLoaded()
      .then(() => {
        if (!mountedRef.current) return;
        const castAny = window.cast;
        const chromeAny = window.chrome;
        if (!castAny?.framework || !chromeAny?.cast) {
          setIsAvailable(false);
          return;
        }

        const context = castAny.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: getReceiverApplicationId(),
          autoJoinPolicy:
            chromeAny.cast.AutoJoinPolicy?.ORIGIN_SCOPED ?? chromeAny.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        setIsAvailable(true);
        syncIsCastingFromContext(context, castAny, setIsCasting);

        if (!castListenersAttached) {
          castListenersAttached = true;

          const castStateType = castAny.framework.CastContextEventType?.CAST_STATE_CHANGED;
          if (castStateType) {
            context.addEventListener(castStateType, () => {
              syncIsCastingFromContext(context, castAny, setIsCasting);
            });
          }

          const sessionStateType = castAny.framework.CastContextEventType?.SESSION_STATE_CHANGED;
          if (sessionStateType) {
            context.addEventListener(sessionStateType, () => {
              syncIsCastingFromContext(context, castAny, setIsCasting);
            });
          }
        }
      })
      .catch((err) => {
        console.warn('[Chromecast] SDK unavailable:', err);
        if (!mountedRef.current) return;
        setIsAvailable(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopCasting = useCallback(() => {
    if (typeof window === 'undefined' || !window.cast?.framework?.CastContext) return;
    try {
      window.cast.framework.CastContext.getInstance().endCurrentSession(true);
    } catch (err) {
      console.warn('[Chromecast] endCurrentSession failed:', err);
    }
    setIsCasting(false);
  }, []);

  const castMedia = useCallback(
    async (src: string, title: string, currentTime: number): Promise<boolean> => {
      if (typeof window === 'undefined') return false;
      if (!window.cast?.framework?.CastContext || !window.chrome?.cast) {
        console.warn('[Chromecast] Cast APIs not ready');
        return false;
      }

      const castAny = window.cast;
      const chromeAny = window.chrome;
      const context = castAny.framework.CastContext.getInstance();

      const absoluteSrc = toAbsoluteMediaUrl(src);
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(absoluteSrc)) {
        console.warn(
          '[Chromecast] Media URL points to localhost — Chromecast cannot reach it. Use LAN IP or NAS domain.',
          absoluteSrc
        );
      }

      const contentType = getContentTypeFromUrl(absoluteSrc);
      const mediaInfo = new chromeAny.cast.media.MediaInfo(absoluteSrc, contentType);
      mediaInfo.streamType = chromeAny.cast.media.StreamType?.BUFFERED ?? 'BUFFERED';
      mediaInfo.metadata = new chromeAny.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.metadataType = chromeAny.cast.media.MetadataType?.GENERIC ?? 0;
      mediaInfo.metadata.title = title || 'Popcornn';

      const request = new chromeAny.cast.media.LoadRequest(mediaInfo);
      request.currentTime = Math.max(0, currentTime ?? 0);
      request.autoplay = true;

      try {
        // requestSession ouvre le picker ; ne renvoie PAS la session CAF.
        await context.requestSession();
        const session = context.getCurrentSession?.();
        if (!session) {
          console.error('[Chromecast] No current session after requestSession');
          setIsCasting(false);
          return false;
        }

        setIsCasting(true);
        await session.loadMedia(request);
        console.info('[Chromecast] loadMedia OK', { url: absoluteSrc, title, currentTime });
        return true;
      } catch (err) {
        console.error('[Chromecast] castMedia failed:', err, { url: absoluteSrc, contentType });
        setIsCasting(false);
        return false;
      }
    },
    []
  );

  return { isAvailable, isCasting, castMedia, stopCasting };
}
