import { useState, useEffect } from 'preact/hooks';

// Variable globale pour stocker le WakeLock
let wakeLock: WakeLockSentinel | null = null;

/**
 * Détecte si on est sur Android
 */
function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Détecte si on est sur mobile (Android ou iOS)
 */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Verrouille l'écran en mode paysage (pour la lecture vidéo)
 */
async function lockLandscapeOrientation(): Promise<void> {
  try {
    const screen = window.screen as any;
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
      console.log('[Fullscreen] Orientation verrouillée en paysage');
    }
  } catch (e) {
    // L'API peut ne pas être supportée ou refusée
    console.warn('[Fullscreen] Impossible de verrouiller l\'orientation:', e);
  }
}

/**
 * Déverrouille l'orientation de l'écran
 */
function unlockOrientation(): void {
  try {
    const screen = window.screen as any;
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
      console.log('[Fullscreen] Orientation déverrouillée');
    }
  } catch (e) {
    console.warn('[Fullscreen] Impossible de déverrouiller l\'orientation:', e);
  }
}

/**
 * Active le WakeLock pour garder l'écran allumé
 */
async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('[Fullscreen] WakeLock activé - écran restera allumé');
      
      wakeLock?.addEventListener('release', () => {
        console.log('[Fullscreen] WakeLock relâché');
      });
    }
  } catch (e) {
    console.warn('[Fullscreen] WakeLock non disponible:', e);
  }
}

/**
 * Relâche le WakeLock
 */
async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
      console.log('[Fullscreen] WakeLock désactivé');
    } catch (e) {
      console.warn('[Fullscreen] Erreur lors de la libération du WakeLock:', e);
    }
  }
}

/**
 * Masque la barre de navigation Android via CSS et meta viewport
 * (Solution de contournement pour le mode immersif)
 */
function setAndroidImmersiveStyle(enabled: boolean): void {
  if (!isAndroid()) return;
  
  // Créer ou modifier la meta viewport pour le mode immersif
  let metaViewport = document.querySelector('meta[name="viewport"]');
  if (!metaViewport) {
    metaViewport = document.createElement('meta');
    metaViewport.setAttribute('name', 'viewport');
    document.head.appendChild(metaViewport);
  }
  
  if (enabled) {
    // Mode immersif : viewport en plein écran
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
    
    // Ajouter des styles pour couvrir les zones safe area
    document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-left', 'env(safe-area-inset-left, 0px)');
    document.documentElement.style.setProperty('--safe-area-inset-right', 'env(safe-area-inset-right, 0px)');
    
    // Styles pour masquer les barres système visuellement
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  } else {
    // Restaurer le viewport normal
    metaViewport.setAttribute('content', 
      'width=device-width, initial-scale=1.0'
    );
    
    // Restaurer les styles
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
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
      
      // Gérer le WakeLock et l'orientation selon l'état du plein écran
      if (isCurrentlyFullscreen) {
        requestWakeLock();
        if (isMobile()) {
          lockLandscapeOrientation();
          setAndroidImmersiveStyle(true);
        }
      } else {
        releaseWakeLock();
        if (isMobile()) {
          unlockOrientation();
          setAndroidImmersiveStyle(false);
        }
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
      // Nettoyer en quittant
      releaseWakeLock();
      if (isMobile()) {
        unlockOrientation();
        setAndroidImmersiveStyle(false);
      }
    };
  }, []);

  return isFullscreen;
}

/**
 * Vérifie si le document est actuellement en plein écran
 */
export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * Active le plein écran pour un élément donné avec support multi-navigateurs
 * Inclut le support amélioré pour Android (orientation, WakeLock, etc.)
 */
export async function requestFullscreen(element: HTMLElement): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Fullscreen API not available'));
  }

  // Vérifier si déjà en plein écran
  if (isFullscreenActive()) {
    return Promise.resolve();
  }

  // Sur mobile, activer les fonctionnalités supplémentaires
  if (isMobile()) {
    await requestWakeLock();
    await lockLandscapeOrientation();
    setAndroidImmersiveStyle(true);
  }

  // Options pour le plein écran - demander le mode de navigation masqué
  const fullscreenOptions: FullscreenOptions = {
    navigationUI: 'hide' // Demande de masquer les contrôles de navigation
  };

  // Essayer les différentes APIs fullscreen selon le navigateur
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen(fullscreenOptions);
    } else if ((element as any).webkitRequestFullscreen) {
      // Safari/iOS - pas d'options supportées
      await (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
      await (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
      await (element as any).msRequestFullscreen();
    } else {
      throw new Error('Fullscreen API not supported');
    }
  } catch (e) {
    // En cas d'échec du plein écran natif sur Android, 
    // on reste en mode "pseudo-fullscreen" avec les styles immersifs
    if (isAndroid()) {
      console.warn('[Fullscreen] API native non disponible, mode immersif CSS activé');
      return Promise.resolve();
    }
    throw e;
  }
}

/**
 * Désactive le plein écran avec support multi-navigateurs
 */
export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Fullscreen API not available'));
  }

  // Nettoyer les fonctionnalités mobile
  if (isMobile()) {
    await releaseWakeLock();
    unlockOrientation();
    setAndroidImmersiveStyle(false);
  }

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      await (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen();
    }
  } catch (e) {
    // Si on ne peut pas quitter le plein écran natif, les styles sont quand même nettoyés
    console.warn('[Fullscreen] Erreur lors de la sortie du plein écran:', e);
  }
}

/**
 * Active ou désactive le plein écran pour un élément donné
 */
export function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) {
    return Promise.reject(new Error('Element is null'));
  }

  if (isFullscreenActive()) {
    return exitFullscreen();
  } else {
    return requestFullscreen(element);
  }
}
