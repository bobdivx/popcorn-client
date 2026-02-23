import { useState, useEffect, useCallback } from 'preact/hooks';

const CAST_SENDER_SCRIPT =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

/** ID du récepteur média par défaut (pas d'enregistrement Google requis). */
const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845';

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: {
      framework: {
        CastContext: {
          getInstance: () => CastContextInstance;
        };
        CastContextEventType?: { SESSION_STATE_CHANGED: string };
        SessionState?: { SESSION_STARTED: string; SESSION_ENDED: string };
      };
    };
    chrome?: {
      cast?: {
        media?: {
          DEFAULT_MEDIA_RECEIVER_APP_ID?: string;
          MediaInfo: new (contentId: string, contentType: string) => { contentId: string; contentType: string; metadata?: { title?: string }; streamType?: string };
          LoadRequest: new (mediaInfo: unknown) => { media: unknown; autoplay?: boolean; currentTime?: number };
        };
      };
    };
  }
}

interface CastContextInstance {
  setOptions: (opts: { receiverApplicationId: string }) => void;
  requestSession: () => Promise<CastSession>;
  getCurrentSession: () => CastSession | null;
  addEventListener: (type: string, fn: (e: { sessionState?: string }) => void) => void;
  removeEventListener?: (type: string, fn: (e: { sessionState?: string }) => void) => void;
}

interface CastSession {
  loadMedia: (req: unknown) => Promise<unknown>;
  endSession?: (stopApp: boolean) => void;
}

let scriptLoaded: Promise<boolean> | null = null;

function loadCastScript(): Promise<boolean> {
  if (scriptLoaded != null) return scriptLoaded;
  scriptLoaded = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.cast?.framework?.CastContext) {
      initCastContext();
      resolve(true);
      return;
    }
    const existing = document.querySelector(`script[src="${CAST_SENDER_SCRIPT}"]`);
    if (existing) {
      const check = () => {
        if (window.cast?.framework?.CastContext) {
          initCastContext();
          resolve(true);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
      return;
    }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) initCastContext();
      resolve(isAvailable);
    };
    const script = document.createElement('script');
    script.src = CAST_SENDER_SCRIPT;
    script.async = true;
    script.onload = () => {
      const check = () => {
        if (window.cast?.framework?.CastContext) {
          resolve(true);
        } else {
          setTimeout(check, 50);
        }
      };
      setTimeout(check, 200);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptLoaded;
}

function initCastContext(): void {
  try {
    const ctx = window.cast?.framework?.CastContext?.getInstance?.();
    const appId = window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ?? DEFAULT_MEDIA_RECEIVER_APP_ID;
    if (ctx) ctx.setOptions({ receiverApplicationId: appId });
  } catch (_) {}
}

/** Détecte si l’environnement supporte le Cast (navigateur avec extension/Chrome). */
export interface UseChromecastResult {
  /** Cast SDK chargé et disponible (navigateur compatible). */
  isAvailable: boolean;
  /** Une session Cast est active (lecture sur un appareil). */
  isCasting: boolean;
  /** Lance la sélection d’un appareil puis envoie la lecture sur le Chromecast. */
  castMedia: (mediaUrl: string, title: string, currentTimeSeconds?: number) => Promise<void>;
  /** Arrête la lecture sur le Chromecast (déconnexion de la session). */
  stopCast: () => Promise<void>;
}

export function useChromecast(): UseChromecastResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);

  useEffect(() => {
    loadCastScript().then(setIsAvailable);
  }, []);

  useEffect(() => {
    if (!isAvailable || !window.cast?.framework?.CastContext) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const updateCasting = () => {
      setIsCasting(!!ctx.getCurrentSession());
    };
    updateCasting();
    const eventType = window.cast.framework.CastContextEventType?.SESSION_STATE_CHANGED ?? 'SESSION_STATE_CHANGED';
    ctx.addEventListener(eventType, updateCasting);
    return () => {
      try {
        ctx.removeEventListener?.(eventType, updateCasting);
      } catch (_) {}
    };
  }, [isAvailable]);

  const castMedia = useCallback(
    async (mediaUrl: string, title: string, currentTimeSeconds = 0) => {
      if (!isAvailable || !window.cast?.framework?.CastContext) return;
      const ctx = window.cast.framework.CastContext.getInstance();
      let session = ctx.getCurrentSession();
      if (!session) {
        try {
          session = await ctx.requestSession();
        } catch (err) {
          console.warn('[Chromecast] Impossible de démarrer une session:', err);
          return;
        }
      }
      if (!session?.loadMedia) return;
      const contentType = mediaUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';
      const ChromeCast = window.chrome?.cast;
      let request: unknown;
      if (ChromeCast?.media?.MediaInfo && ChromeCast?.media?.LoadRequest) {
        const mediaInfo = new ChromeCast.media.MediaInfo(mediaUrl, contentType);
        mediaInfo.metadata = { title };
        mediaInfo.streamType = 'BUFFERED';
        request = new ChromeCast.media.LoadRequest(mediaInfo);
        (request as { autoplay?: boolean; currentTime?: number }).autoplay = true;
        (request as { currentTime?: number }).currentTime = currentTimeSeconds;
      } else {
        request = {
          media: { contentId: mediaUrl, contentType, streamType: 'BUFFERED', metadata: { title } },
          autoplay: true,
          currentTime: currentTimeSeconds,
        };
      }
      try {
        await session.loadMedia(request);
      } catch (err) {
        console.warn('[Chromecast] Erreur loadMedia:', err);
      }
    },
    [isAvailable]
  );

  const stopCast = useCallback(async () => {
    if (!window.cast?.framework?.CastContext) return;
    const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
    if (session?.endSession) {
      try {
        session.endSession(true);
      } catch (_) {}
    }
  }, []);

  return { isAvailable, isCasting, castMedia, stopCast };
}
