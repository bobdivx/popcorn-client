import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

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
 * - Fournit `castMedia(src, title, currentTime)`
 */
export interface UseChromecastReturn {
  isAvailable: boolean;
  isCasting: boolean;
  castMedia: (src: string, title: string, currentTime: number) => void;
}

const CAST_SENDER_SCRIPT_URL = '//www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845';

let castSdkPromise: Promise<void> | null = null;

function getContentTypeFromUrl(src: string): string {
  const u = src.split('?')[0].toLowerCase();
  if (u.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (u.endsWith('.mpd')) return 'application/dash+xml';
  if (u.endsWith('.mp4') || u.endsWith('.m4v')) return 'video/mp4';
  if (u.endsWith('.webm')) return 'video/webm';
  if (u.endsWith('.mkv')) return 'video/mp4'; // Fallback (Cast ne supporte pas forcément mkv directement)
  return 'video/mp4';
}

function ensureCastSdkLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  if (castSdkPromise) return castSdkPromise;

  castSdkPromise = new Promise<void>((resolve, reject) => {
    if (window.cast?.framework?.CastContext) {
      resolve();
      return;
    }

    // Charger le SDK de sender
    const existing = document.querySelector(`script[src="${CAST_SENDER_SCRIPT_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      // Attendre que le SDK soit réellement prêt
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
      // Le `load` du script peut arriver avant que `cast.framework` soit complètement prêt.
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

  // Pour éviter d’attacher plusieurs listeners si le hook est utilisé dans plusieurs lecteurs.
  const listenersAttachedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    ensureCastSdkLoaded()
      .then(() => {
        if (!mountedRef.current) return;
        const castAny = window.cast;
        const chromeAny = window.chrome;
        if (!castAny?.framework || !chromeAny?.cast) {
          setIsAvailable(false);
          return;
        }

        // Initialisation du CastContext (sender)
        const context = castAny.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chromeAny.cast.AutoJoinPolicy?.ORIGIN_SCOPED ?? chromeAny.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        // Le bouton devient dispo dès que le SDK est prêt.
        setIsAvailable(true);

        if (!listenersAttachedRef.current) {
          listenersAttachedRef.current = true;

          // Mettre à jour `isCasting` sur les changements d’état.
          const stateChangedType = castAny.framework.CastContextEventType?.CAST_STATE_CHANGED;
          if (stateChangedType) {
            context.addEventListener(stateChangedType, (event: any) => {
              const nextState = event?.castState ?? context.getCastState?.();
              const connected = nextState === castAny.framework.CastState?.CONNECTED;
              const connecting = nextState === castAny.framework.CastState?.CONNECTING;
              setIsCasting(connected || connecting);
            });
          }
        }
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setIsAvailable(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const castMedia = useCallback(
    (src: string, title: string, currentTime: number) => {
      if (typeof window === 'undefined') return;
      if (!window.cast?.framework?.CastContext || !window.chrome?.cast?.requestSession) return;

      const castAny = window.cast;
      const chromeAny = window.chrome;

      const context = castAny.framework.CastContext.getInstance();

      const contentType = getContentTypeFromUrl(src);
      const mediaInfo = new chromeAny.cast.media.MediaInfo(src, contentType);

      // LoadRequest (Default Media Receiver) + position de lecture
      const request = new chromeAny.cast.media.LoadRequest(mediaInfo);
      request.currentTime = Math.max(0, currentTime ?? 0);
      request.autoplay = true;

      // Demander/créer une session puis charger le média.
      // `requestSession` est fourni par CastContext.
      context
        .requestSession()
        .then((session: any) => {
          setIsCasting(true);
          // Optionnel: afficher la "destination" via title (selon receiver)
          // @ts-ignore
          request.customData = { title };
          return session.loadMedia(request);
        })
        .catch(() => {
          // Pas de device / erreur d’init
          setIsCasting(false);
        });
    },
    [setIsCasting]
  );

  return { isAvailable, isCasting, castMedia };
}
