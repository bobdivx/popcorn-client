import { useState, useEffect } from 'preact/hooks';

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
  let metaViewport = document.querySelector('meta[name="viewport"]');
  if (!metaViewport) {
    metaViewport = document.createElement('meta');
    metaViewport.setAttribute('name', 'viewport');
    document.head.appendChild(metaViewport);
  }
  if (enabled) {
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  } else {
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
  }
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? (document as any).mozFullScreenElement ?? (document as any).msFullscreenElement);
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
    handleFullscreenChange();
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      releaseWakeLock();
      if (isMobile()) { unlockOrientation(); setAndroidImmersiveStyle(false); }
    };
  }, []);
  return isFullscreen;
}

export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? (document as any).mozFullScreenElement ?? (document as any).msFullscreenElement);
}

export async function requestFullscreen(element: HTMLElement): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Fullscreen API not available'));
  if (isFullscreenActive()) return Promise.resolve();
  if (isMobile()) {
    await requestWakeLock();
    await lockLandscapeOrientation();
    setAndroidImmersiveStyle(true);
  }
  const fullscreenOptions: FullscreenOptions = { navigationUI: 'hide' };
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
      // En WebView Android, l'API fullscreen peut être désactivée. On se repose alors uniquement sur le bridge natif.
      try {
        (window as any).Android?.enterFullscreen?.();
      } catch (err) {
        console.warn('[Fullscreen] Erreur fallback Android.enterFullscreen:', err);
      }
      return Promise.resolve();
    }
    throw e;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('Fullscreen API not available'));
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
