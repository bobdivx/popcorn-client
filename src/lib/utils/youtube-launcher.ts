/**
 * Utilitaire pour lancer des vidéos YouTube dans l'app native selon la plateforme.
 * - webOS : API Application Manager (app YouTube ou navigateur TV)
 * - Android : scheme vnd.youtube: (app YouTube)
 * - iOS : scheme youtube:// (app YouTube)
 * - Autres : nouvel onglet avec l'URL (ou navigation directe sur TV/NAS où window.open est souvent bloqué)
 */

import { isWebOSTV, isTVPlatform } from './device-detection';

declare global {
  interface Window {
    webOS?: {
      service: {
        request: (uri: string, options: {
          method: string;
          parameters?: Record<string, unknown>;
          onSuccess?: (res: unknown) => void;
          onFailure?: (err: { errorCode?: number; errorText?: string }) => void;
        }) => void;
      };
    };
  }
}

const YOUTUBE_APP_ID = 'youtube.leanback.v4';
const BROWSER_APP_ID = 'com.webos.app.browser';

/** User-agents où l'iframe YouTube est souvent bloquée (SmartTV, NAS kiosk, etc.) */
function isEmbedRestrictedUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /NetCast|TV Safari|SmartTV|Large Screen|webOS|Web0S/i.test(navigator.userAgent || '');
}

function isWebOSAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.webOS?.service?.request === 'function';
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

/** Sur TV/NAS, window.open est souvent bloqué : on navigue dans la fenêtre actuelle. */
function shouldNavigateInPlace(): boolean {
  return isTVPlatform() || isWebOSTV() || isEmbedRestrictedUA();
}

/**
 * Lance une vidéo YouTube de la façon la plus adaptée à la plateforme.
 * - webOS : API Application Manager (app YouTube ou navigateur TV)
 * - Android : app YouTube via vnd.youtube:
 * - iOS : app YouTube via youtube:
 * - webOS sans API / TV / NAS : navigation directe (window.open souvent bloqué)
 * - Autres : nouvel onglet avec l'URL
 */
export function launchYouTube(videoId: string): void {
  if (typeof window === 'undefined') return;

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // webOS : API Application Manager (uniquement si window.webOS est disponible)
  if (isWebOSTV() && isWebOSAvailable()) {
    launchYouTubeOnWebOS(videoId);
    return;
  }

  // Android : vnd.youtube:VIDEO_ID ouvre l'app YouTube (si installée)
  if (isAndroid()) {
    window.location.href = `vnd.youtube:${videoId}`;
    return;
  }

  // iOS : youtube://VIDEO_ID ouvre l'app YouTube (si installée)
  if (isIOS()) {
    window.location.href = `youtube://${videoId}`;
    return;
  }

  // Fallback : TV, NAS, webOS sans API → navigation directe (évite popup bloquée)
  if (shouldNavigateInPlace()) {
    window.location.href = watchUrl;
    return;
  }

  window.open(watchUrl, '_blank');
}

function launchYouTubeOnWebOS(videoId: string): void {
  if (!window.webOS?.service?.request) return;

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const launchBrowser = () => {
    window.webOS!.service.request('luna://com.webos.applicationManager', {
      method: 'launch',
      parameters: {
        id: BROWSER_APP_ID,
        params: { target: watchUrl },
      },
      onSuccess: () => console.log('[webOS] Browser launched with YouTube URL'),
      onFailure: () => { window.location.href = watchUrl; },
    });
  };

  window.webOS.service.request('luna://com.webos.applicationManager', {
    method: 'launch',
    parameters: {
      id: YOUTUBE_APP_ID,
      params: { contentTarget: watchUrl },
    },
    onSuccess: () => console.log('[webOS] YouTube app launched'),
    onFailure: launchBrowser,
  });
}

/**
 * Indique si on doit afficher le bouton "Ouvrir YouTube" au lieu de l'iframe embed.
 * Uniquement vrai sur les plateformes où l'iframe ne fonctionne pas : TV (webOS, Android TV, Apple TV)
 * et user-agents restreints (SmartTV, NetCast, etc.).
 * Sur mobile (Android Chrome, iPhone Safari), l'iframe fonctionne → on affiche l'embed.
 */
export function shouldLaunchNativeYouTube(): boolean {
  if (typeof window === 'undefined') return false;
  if (isTVPlatform()) return true;
  if (isEmbedRestrictedUA()) return true;
  return false;
}
