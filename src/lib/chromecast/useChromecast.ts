import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { isTVPlatform, isWebOSTV } from '../utils/device-detection';
import { signMediaUrlAsync, stripMediaToken } from '../streaming/mediaToken';

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
/**
 * Styled Media Receiver Popcornn (Cast Console).
 * Override possible via PUBLIC_CAST_RECEIVER_APP_ID.
 * Tant que l’app est « Non publié », seuls les appareils enregistrés dans la console marchent.
 */
const POPCORNN_CAST_RECEIVER_APP_ID = '3F212CD6';

let castSdkPromise: Promise<void> | null = null;
let castListenersAttached = false;

function getReceiverApplicationId(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? String((import.meta as any).env?.PUBLIC_CAST_RECEIVER_APP_ID || '').trim()
      : '';
  return fromEnv || POPCORNN_CAST_RECEIVER_APP_ID;
}

const POPCORNN_CAST_LOGO_URL = 'https://client.popcornn.app/apple-touch-icon.png';

function toAbsoluteMediaUrl(src: string): string {
  if (!src) return src;
  try {
    return new URL(src, typeof window !== 'undefined' ? window.location.href : undefined).href;
  } catch {
    return src;
  }
}

/**
 * Chromecast doit joindre le backend directement.
 * Les URLs `/api/remote-stream/proxy?backend=…&path=…` cassent les segments HLS
 * (URLs relatives résolues contre le mauvais hôte).
 */
function resolveCastableMediaUrl(src: string): string {
  const absolute = toAbsoluteMediaUrl(src);
  try {
    const u = new URL(absolute);
    if (!u.pathname.includes('/api/remote-stream/proxy')) return absolute;
    const backend = (u.searchParams.get('backend') || '').trim();
    const path = (u.searchParams.get('path') || '').trim();
    if (!backend || !path) return absolute;
    const out = new URL(path.startsWith('/') ? path : `/${path}`, backend.endsWith('/') ? backend : `${backend}/`);
    u.searchParams.forEach((value, key) => {
      if (key === 'backend' || key === 'path') return;
      out.searchParams.set(key, value);
    });
    return out.href;
  } catch {
    return absolute;
  }
}

function getContentTypeFromUrl(src: string): string {
  const u = src.split('?')[0].toLowerCase();
  if (u.endsWith('.m3u8')) return 'application/x-mpegurl';
  if (u.endsWith('.mpd')) return 'application/dash+xml';
  if (u.endsWith('.mp4') || u.endsWith('.m4v')) return 'video/mp4';
  if (u.endsWith('.webm')) return 'video/webm';
  if (u.endsWith('.mkv')) return 'video/mp4'; // Fallback (Cast ne supporte pas forcément mkv directement)
  return 'video/mp4';
}

function isHlsUrl(src: string): boolean {
  return src.split('?')[0].toLowerCase().endsWith('.m3u8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePlaylistRef(ref: string, playlistUrl: string): string {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('#')) return trimmed;
  try {
    return new URL(trimmed, playlistUrl).href;
  } catch {
    return trimmed;
  }
}

/** Prefere la variante 720p (plus stable sur Cast) sinon la première. */
function pickMediaPlaylistUrl(masterBody: string, masterUrl: string): string | null {
  const lines = masterBody.split(/\r?\n/);
  let preferred: string | null = null;
  let first: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;
    const abs = resolvePlaylistRef(next, masterUrl);
    if (!first) first = abs;
    if (/\/v720\//i.test(next) || /720/.test(line)) {
      preferred = abs;
      break;
    }
  }
  return preferred || first;
}

function countTsSegments(body: string): number {
  return body.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t.endsWith('.ts') && !t.startsWith('#');
  }).length;
}

/**
 * Chromecast est fragile sur les master ABR et les playlists encore en génération.
 * → attendre ENDLIST, caster une playlist media (v720) plutôt que le master.
 */
async function prepareHlsCastUrl(streamUrl: string): Promise<{ url: string; complete: boolean }> {
  const deadline = Date.now() + 180_000;
  let candidate = streamUrl;

  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(candidate, { method: 'GET', cache: 'no-store', credentials: 'omit' });
    } catch (err) {
      console.warn('[Chromecast] playlist fetch failed, retry:', err);
      await sleep(2000);
      continue;
    }

    if (res.status === 503 || res.status === 202) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) {
      console.warn('[Chromecast] playlist HTTP', res.status, candidate);
      await sleep(2000);
      continue;
    }

    const body = await res.text();
    if (body.includes('#EXT-X-STREAM-INF')) {
      const mediaUrl = pickMediaPlaylistUrl(body, candidate);
      if (!mediaUrl) {
        await sleep(1500);
        continue;
      }
      candidate = mediaUrl;
      continue;
    }

    const segments = countTsSegments(body);
    const complete = body.includes('#EXT-X-ENDLIST');
    if (complete && segments >= 2) {
      console.info('[Chromecast] HLS ready for cast', { url: candidate, segments });
      return { url: candidate, complete: true };
    }
    if (segments >= 8) {
      // Assez de buffer pour démarrer ; Cast en BUFFERED sans ENDLIST reste risqué → on attend encore un peu
      console.info('[Chromecast] HLS partial, waiting ENDLIST…', { segments });
    }
    await sleep(2000);
  }

  console.warn('[Chromecast] HLS not complete before timeout, casting anyway', candidate);
  return { url: candidate, complete: false };
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

      let absoluteSrc = resolveCastableMediaUrl(src);
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(absoluteSrc)) {
        console.warn(
          '[Chromecast] Media URL points to localhost — Chromecast cannot reach it. Use LAN IP or NAS domain.',
          absoluteSrc
        );
      }

      const hls = isHlsUrl(absoluteSrc);
      let hlsComplete = false;
      if (hls) {
        // Ouvrir le picker tout de suite pendant qu’on attend la playlist complète.
        try {
          await context.requestSession();
        } catch (err) {
          console.error('[Chromecast] requestSession failed:', err);
          setIsCasting(false);
          return false;
        }
        setIsCasting(true);
        const prepared = await prepareHlsCastUrl(absoluteSrc);
        absoluteSrc = prepared.url;
        hlsComplete = prepared.complete;
      }

      // Le Chromecast lit l'URL lui-meme (sans en-tete) : URL signee (jeton media).
      absoluteSrc = await signMediaUrlAsync(absoluteSrc);
      const contentType = getContentTypeFromUrl(absoluteSrc);
      const mediaInfo = new chromeAny.cast.media.MediaInfo(absoluteSrc, contentType);
      // HLS Popcornn = MPEG-TS muxé. Sans ça, Cast peut boucler (écran noir / segment retry).
      if (hls) {
        const segFmt = chromeAny.cast.media.HlsSegmentFormat;
        const vidFmt = chromeAny.cast.media.HlsVideoSegmentFormat;
        if (segFmt?.TS != null) mediaInfo.hlsSegmentFormat = segFmt.TS;
        if (vidFmt?.MPEG2_TS != null) mediaInfo.hlsVideoSegmentFormat = vidFmt.MPEG2_TS;
      }
      // BUFFERED seulement si ENDLIST ; sinon LIVE évite les restarts Cast sur playlist progressive.
      if (hls && !hlsComplete && chromeAny.cast.media.StreamType?.LIVE != null) {
        mediaInfo.streamType = chromeAny.cast.media.StreamType.LIVE;
      } else {
        mediaInfo.streamType = chromeAny.cast.media.StreamType?.BUFFERED ?? 'BUFFERED';
      }
      mediaInfo.metadata = new chromeAny.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.metadataType = chromeAny.cast.media.MetadataType?.GENERIC ?? 0;
      mediaInfo.metadata.title = title || 'Popcornn';
      try {
        mediaInfo.metadata.images = [new chromeAny.cast.Image(POPCORNN_CAST_LOGO_URL)];
      } catch {
        /* Image ctor indisponible selon version SDK */
      }

      const request = new chromeAny.cast.media.LoadRequest(mediaInfo);
      // HLS : démarrer à 0. Un currentTime milieu d’épisode pendant la génération
      // provoque souvent écran noir + retry du même segment sur Cast.
      request.currentTime = hls ? 0 : Math.max(0, currentTime ?? 0);
      request.autoplay = true;

      try {
        if (!hls) {
          await context.requestSession();
        }
        const session = context.getCurrentSession?.();
        if (!session) {
          console.error('[Chromecast] No current session after requestSession');
          setIsCasting(false);
          return false;
        }

        setIsCasting(true);
        await session.loadMedia(request);
        console.info('[Chromecast] loadMedia OK', {
          url: stripMediaToken(absoluteSrc),
          title,
          startAt: request.currentTime,
          hlsComplete,
          appId: getReceiverApplicationId(),
        });
        return true;
      } catch (err) {
        console.error('[Chromecast] castMedia failed:', err, { url: stripMediaToken(absoluteSrc), contentType });
        setIsCasting(false);
        return false;
      }
    },
    []
  );

  return { isAvailable, isCasting, castMedia, stopCasting };
}
