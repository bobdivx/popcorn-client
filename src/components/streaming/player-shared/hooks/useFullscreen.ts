import { useState, useEffect } from 'preact/hooks';
import { isTVPlatform, isWebOSTV } from '../../../../lib/utils/device-detection';
import { onNativeFullscreenExit, setNativeFullscreen } from '../../../../lib/utils/native-fullscreen';

let wakeLock: WakeLockSentinel | null = null;

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

async function lockLandscapeOrientation(): Promise<void> {
  try {
    const screen = window.screen as any;
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch (e) {
    console.warn('[Fullscreen] Impossible de verrouiller l\'orientation:', e);
  }
}

function unlockOrientation(): void {
  try {
    const screen = window.screen as any;
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch (e) {
    console.warn('[Fullscreen] Impossible de déverrouiller l\'orientation:', e);
  }
}

async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
    }
  } catch (e) {
    console.warn('[Fullscreen] WakeLock non disponible:', e);
  }
}

async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (e) {
      console.warn('[Fullscreen] Erreur libération WakeLock:', e);
    }
  }
}

function setAndroidImmersiveStyle(enabled: boolean): void {
  if (!isAndroid()) return;
  // Android TV : la meta viewport (width=1920, TvViewportScript) ne doit jamais repasser en device-width.
  let metaViewport = document.querySelector('meta[name="viewport"]');
  if (!metaViewport) {
    metaViewport = document.createElement('meta');
    metaViewport.setAttribute('name', 'viewport');
    document.head.appendChild(metaViewport);
  }
  if (enabled) {
    if (!document.documentElement.hasAttribute('data-tv-viewport')) metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  } else {
    if (!document.documentElement.hasAttribute('data-tv-viewport')) metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
  }
}

// ---------------------------------------------------------------------------------------------
// Plein écran « CSS » de secours (WebView Android Tauri/Wry, iPhone, API refusée) :
// le WebView Android n'implémente pas onShowCustomView → requestFullscreen échoue ou est annulé
// aussitôt. On fixe alors le lecteur sur tout l'écran (fixed inset-0, safe-area) et on expose
// cet état comme un plein écran (isFullscreenActive / useFullscreen) pour que le bouton serve
// aussi à en sortir. Le vrai plein écran natif (barres système masquées) nécessite l'APK.
// ---------------------------------------------------------------------------------------------
const PSEUDO_EVENT = 'popcorn-pseudo-fullscreenchange';
const PSEUDO_STYLE_PROPS = [
  'position',
  'inset',
  'top',
  'left',
  'right',
  'bottom',
  'width',
  'height',
  'z-index',
  'background',
  'padding',
  'box-sizing',
] as const;
let pseudoFullscreenElement: HTMLElement | null = null;
let pseudoSavedStyle: Record<string, string> | null = null;
/** L'utilisateur veut le plein écran (jusqu'à exitFullscreen) — pour la vérification différée. */
let fullscreenWanted = false;

function isTvLike(): boolean {
  try {
    return isTVPlatform() || isWebOSTV();
  } catch {
    return false;
  }
}

function nativeFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ??
    (document as any).webkitFullscreenElement ??
    (document as any).mozFullScreenElement ??
    (document as any).msFullscreenElement ??
    null
  );
}

export function isPseudoFullscreenActive(): boolean {
  return !!pseudoFullscreenElement && pseudoFullscreenElement.isConnected;
}

function emitPseudoChange(): void {
  try {
    document.dispatchEvent(new Event(PSEUDO_EVENT));
  } catch {
    /* ignore */
  }
}

function enterPseudoFullscreen(element: HTMLElement): void {
  if (typeof document === 'undefined') return;
  if (pseudoFullscreenElement === element && element.isConnected) return;
  if (pseudoFullscreenElement) exitPseudoFullscreen(false);
  pseudoSavedStyle = {};
  for (const prop of PSEUDO_STYLE_PROPS) {
    pseudoSavedStyle[prop] = element.style.getPropertyValue(prop);
  }
  const st = element.style;
  st.setProperty('position', 'fixed', 'important');
  st.setProperty('inset', '0', 'important');
  st.setProperty('top', '0', 'important');
  st.setProperty('left', '0', 'important');
  st.setProperty('right', '0', 'important');
  st.setProperty('bottom', '0', 'important');
  st.setProperty('width', '100vw', 'important');
  st.setProperty('height', '100dvh', 'important');
  st.setProperty('z-index', '2147483000', 'important');
  st.setProperty('background', '#000', 'important');
  st.setProperty('box-sizing', 'border-box', 'important');
  st.setProperty(
    'padding',
    'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)',
    'important',
  );
  element.setAttribute('data-pseudo-fullscreen', 'true');
  document.documentElement.setAttribute('data-pseudo-fullscreen', 'true');
  pseudoFullscreenElement = element;
  document.body.style.overflow = 'hidden';
  if (isMobile()) setAndroidImmersiveStyle(true);
  console.info('[Fullscreen] API plein écran indisponible → plein écran CSS de secours');
  emitPseudoChange();
}

function exitPseudoFullscreen(emit = true): void {
  const el = pseudoFullscreenElement;
  if (!el) return;
  if (pseudoSavedStyle) {
    for (const prop of PSEUDO_STYLE_PROPS) {
      const v = pseudoSavedStyle[prop];
      if (v) el.style.setProperty(prop, v);
      else el.style.removeProperty(prop);
    }
  }
  el.removeAttribute('data-pseudo-fullscreen');
  document.documentElement.removeAttribute('data-pseudo-fullscreen');
  pseudoFullscreenElement = null;
  pseudoSavedStyle = null;
  document.body.style.overflow = '';
  if (isMobile()) setAndroidImmersiveStyle(false);
  if (emit) emitPseudoChange();
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handleFullscreenChange = () => {
      const nativeActive = !!nativeFullscreenElement();
      // Lecteur démonté pendant le plein écran CSS : nettoyer l'état global.
      if (pseudoFullscreenElement && !pseudoFullscreenElement.isConnected) exitPseudoFullscreen(false);
      const isCurrentlyFullscreen = nativeActive || isPseudoFullscreenActive();
      setIsFullscreen(isCurrentlyFullscreen);
      if (isCurrentlyFullscreen) {
        requestWakeLock();
        if (isMobile()) { lockLandscapeOrientation(); setAndroidImmersiveStyle(true); }
      } else {
        releaseWakeLock();
        if (isMobile()) { unlockOrientation(); setAndroidImmersiveStyle(false); }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener(PSEUDO_EVENT, handleFullscreenChange);
    handleFullscreenChange();
    // App Android : le bouton Retour a quitté le plein écran natif (repli CSS) → nettoyer l'état web.
    const unsubscribeNativeExit = onNativeFullscreenExit(() => {
      void exitFullscreen().finally(() => setIsFullscreen(isFullscreenActive()));
    });
    return () => {
      unsubscribeNativeExit();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener(PSEUDO_EVENT, handleFullscreenChange);
      // Lecteur fermé pendant le plein écran CSS : restaurer la page (overflow, attributs).
      window.setTimeout(() => {
        if (pseudoFullscreenElement && !pseudoFullscreenElement.isConnected) {
          fullscreenWanted = false;
          exitPseudoFullscreen();
        }
      }, 0);
      releaseWakeLock();
      if (isMobile()) { unlockOrientation(); setAndroidImmersiveStyle(false); }
    };
  }, []);
  return isFullscreen;
}

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!nativeFullscreenElement() || isPseudoFullscreenActive();
}

export async function requestFullscreen(element: HTMLElement): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Fullscreen API not available'));
  if (isFullscreenActive()) return Promise.resolve();
  if (isMobile()) {
    await requestWakeLock();
    await lockLandscapeOrientation();
    setAndroidImmersiveStyle(true);
  }

  // App Android (Tauri) : immersif + paysage natifs. Non attendu pour ne pas consommer
  // l'activation utilisateur nécessaire à requestFullscreen ; sans effet ailleurs.
  void setNativeFullscreen(true);
  const fullscreenOptions: FullscreenOptions = { navigationUI: 'hide' };
  fullscreenWanted = true;
  // TV / webOS : le layout est déjà plein écran ; pas de repli CSS (comportement inchangé).
  const allowPseudo = !isTvLike();
  if (allowPseudo && (isAndroid() || isMobile())) {
    // WebView Android : la requête peut « réussir » puis être annulée aussitôt (pas de
    // onShowCustomView côté Wry). Si le plein écran natif n'est pas tenu, repli CSS.
    [450, 1500].forEach((ms) =>
      window.setTimeout(() => {
        if (fullscreenWanted && !nativeFullscreenElement() && !isPseudoFullscreenActive() && element.isConnected) {
          enterPseudoFullscreen(element);
        }
      }, ms),
    );
  }
  try {
    // Sur Android (app mobile), si un bridge natif est disponible, le prévenir avant de demander le plein écran web.
    if (isAndroid()) {
      try {
        (window as any).Android?.enterFullscreen?.();
      } catch (e) {
        console.warn('[Fullscreen] Bridge Android.enterFullscreen indisponible:', e);
      }
    }
    if (element.requestFullscreen) await element.requestFullscreen(fullscreenOptions);
    else if ((element as any).webkitRequestFullscreen) await (element as any).webkitRequestFullscreen();
    else if ((element as any).mozRequestFullScreen) await (element as any).mozRequestFullScreen();
    else if ((element as any).msRequestFullscreen) await (element as any).msRequestFullscreen();
    else throw new Error('Fullscreen API not supported');
  } catch (e) {
    if (isAndroid()) {
      // En WebView Android, l'API fullscreen peut être désactivée. On prévient le bridge natif
      // (s'il existe) et on bascule en plein écran CSS.
      try {
        (window as any).Android?.enterFullscreen?.();
      } catch (err) {
        console.warn('[Fullscreen] Erreur fallback Android.enterFullscreen:', err);
      }
    }
    if (allowPseudo) {
      enterPseudoFullscreen(element);
      return Promise.resolve();
    }
    if (isAndroid()) return Promise.resolve();
    throw e;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Fullscreen API not available'));
  fullscreenWanted = false;
  // App Android (Tauri) : quitter aussi l'immersif natif, y compris en repli CSS.
  void setNativeFullscreen(false);
  if (isPseudoFullscreenActive() || pseudoFullscreenElement) {
    exitPseudoFullscreen();
    if (!nativeFullscreenElement()) {
      if (isMobile()) {
        await releaseWakeLock();
        unlockOrientation();
      }
      try {
        if (isAndroid()) (window as any).Android?.exitFullscreen?.();
      } catch {
        /* ignore */
      }
      return;
    }
  }
  if (isMobile()) {
    await releaseWakeLock();
    unlockOrientation();
    setAndroidImmersiveStyle(false);
  }
  try {
    // Notifier le bridge Android si présent pour qu'il remette l'activité dans son orientation normale.
    if (isAndroid()) {
      try {
        (window as any).Android?.exitFullscreen?.();
      } catch (e) {
        console.warn('[Fullscreen] Bridge Android.exitFullscreen indisponible:', e);
      }
    }
    if (!nativeFullscreenElement()) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
    else if ((document as any).mozCancelFullScreen) await (document as any).mozCancelFullScreen();
    else if ((document as any).msExitFullscreen) await (document as any).msExitFullscreen();
  } catch (e) {
    console.warn('[Fullscreen] Erreur sortie plein écran:', e);
  }
}

export function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return Promise.reject(new Error('Element is null'));
  return isFullscreenActive() ? exitFullscreen() : requestFullscreen(element);
}
