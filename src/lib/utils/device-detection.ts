/**
 * Utilitaires pour détecter le type d'appareil (mobile, Android TV, etc.)
 */

/**
 * Détecte si l'appareil est un appareil mobile
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  
  const mobilePatterns = [
    /Android/i,
    /webOS/i,
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /BlackBerry/i,
    /Windows Phone/i,
    /Mobile/i,
  ];

  if (mobilePatterns.some(pattern => pattern.test(userAgent))) {
    return true;
  }

  if (window.innerWidth <= 768) {
    return true;
  }

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    if (window.innerWidth > 1024) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Détecte si l'appareil est Android TV
 */
export function isAndroidTV(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  
  if (/Android.*TV/i.test(userAgent) || /TV/i.test(userAgent)) {
    return true;
  }

  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const platform = (window as any).__TAURI_METADATA__?.platform;
    if (platform === 'android') {
      if (window.innerWidth >= 1280 && window.innerHeight >= 720) {
        return true;
      }
    }
  }

  if (window.innerWidth >= 1920 && window.innerHeight >= 1080) {
    if (/Android/i.test(userAgent)) {
      return true;
    }
  }

  return false;
}

/**
 * Détecte si l'appareil est une tablette
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  
  if (/iPad/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return true;
  }

  if (/Android/i.test(userAgent) && window.innerWidth > 600 && window.innerWidth < 1920) {
    return true;
  }

  return false;
}

/**
 * Détermine si le plein écran automatique doit être activé
 */
export function shouldAutoFullscreen(): boolean {
  return isAndroidTV() || isMobileDevice();
}

/**
 * Détecte si l'appareil est un mobile Android (pas une TV)
 * Utilisé pour adapter l'interface du wizard (scanner QR vs afficher QR)
 */
export function isAndroidMobile(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  
  // Doit être Android
  if (!/Android/i.test(userAgent)) {
    return false;
  }
  
  // Ne doit PAS être une TV
  if (isAndroidTV()) {
    return false;
  }
  
  // Vérifier via Tauri si disponible
  if ('__TAURI_INTERNALS__' in window) {
    const platform = (window as any).__TAURI_METADATA__?.platform;
    if (platform === 'android') {
      // Sur mobile, l'écran est généralement plus petit
      return window.innerWidth < 1280 || window.innerHeight < 720;
    }
  }
  
  return true;
}

/**
 * Détecte si c'est un appareil qui doit afficher un QR code (TV, Desktop, navigateur)
 * vs un appareil qui doit scanner un QR code (mobile)
 */
export function shouldDisplayQRCode(): boolean {
  // Sur mobile Android (pas TV), on scanne plutôt qu'on affiche
  if (isAndroidMobile()) {
    return false;
  }
  
  // Sur iPhone/iPad, on scanne aussi
  if (typeof window !== 'undefined') {
    const userAgent = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      return false;
    }
  }
  
  // Sinon (TV, Desktop, navigateur web), on affiche le QR code
  return true;
}
