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
 * Détecte si l'appareil est LG WebOS TV.
 * Couvre :
 * - build IPK embarqué (`data-webos` au build)
 * - app « simple » / navigateur TV qui charge l’URL du client (UA Web0S, window.webOS)
 */
export function isWebOSTV(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (document.documentElement.getAttribute('data-webos') === 'true') return true;
  } catch {
    // ignore
  }
  try {
    if (sessionStorage.getItem('popcorn_is_webos') === '1') return true;
  } catch {
    // ignore
  }
  const ua = navigator.userAgent || '';
  // UA LG : "Web0S" (zéro) est le plus courant ; aussi WebAppManager / NetCast.
  if (/webOS|Web0S|WebAppManager|NetCast/i.test(ua)) return true;
  if (typeof (window as any).webOS !== 'undefined') return true;
  if (typeof (window as any).PalmSystem !== 'undefined') return true;
  // IPK / WebView file://
  if (
    typeof location !== 'undefined' &&
    location.protocol === 'file:' &&
    /LG|NetCast|SmartTV|Large Screen/i.test(ua)
  ) {
    return true;
  }
  return false;
}

/**
 * Détecte si l'appareil est Apple TV (tvOS)
 */
export function isAppleTV(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Apple TV / tvOS : patterns courants
  if (/AppleTV|Apple TV/i.test(ua)) return true;
  if (/CPU OS.*like Mac OS X.*Apple TV/i.test(ua)) return true;
  return false;
}

/**
 * Détecte si l'appareil est une plateforme TV (Android TV, WebOS, Apple TV)
 * Utilisé pour la navigation à la télécommande dans le lecteur vidéo
 */
export function isTVPlatform(): boolean {
  if (typeof window !== 'undefined') {
    // Force via paramètre URL pour le test facile (?tv=1)
    if (window.location.search.includes('tv=1')) return true;
    try {
      if (document.documentElement.getAttribute('data-tv-platform') === 'true') return true;
      if (document.documentElement.getAttribute('data-webos') === 'true') return true;
      if (sessionStorage.getItem('popcorn_is_tv') === '1') return true;
    } catch {
      // ignore
    }
  }
  return isAndroidTV() || isWebOSTV() || isAppleTV();
}

/** Pose les attributs HTML + sessionStorage dès qu’on détecte webOS/TV (app simple URL incluse). */
export function stampTvPlatformHints(): { isTV: boolean; isWebOS: boolean } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { isTV: false, isWebOS: false };
  }
  const webos = isWebOSTV();
  const tv = isTVPlatform() || webos;
  try {
    if (webos) {
      document.documentElement.setAttribute('data-webos', 'true');
      sessionStorage.setItem('popcorn_is_webos', '1');
    }
    if (tv) {
      document.documentElement.setAttribute('data-tv-platform', 'true');
      sessionStorage.setItem('popcorn_is_tv', '1');
    }
  } catch {
    // ignore
  }
  return { isTV: tv, isWebOS: webos };
}

/**
 * Détecte si l'appareil est Android TV
 */
export function isAndroidTV(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';

  // User-agent explicitement TV
  if (/Android.*TV|TV.*Android/i.test(userAgent)) {
    return true;
  }
  // Autres patterns TV connus (Google TV, Fire TV, boîtiers génériques)
  if (/GoogleTV|FireTV|AFT[A-Z]|Chromecast|SHIELD|NVidia_SHIELD/i.test(userAgent)) {
    return true;
  }
  // WebOS et autres smart TV
  if (/\bTV\b/i.test(userAgent) && !/iPhone|iPad|Mobile/i.test(userAgent)) {
    return true;
  }

  // Tauri Android : tout appareil Android en Tauri avec résolution ≥ 720p est une TV
  // (l'app Tauri n'est distribuée que sur Android TV, pas sur phones)
  if ('__TAURI_INTERNALS__' in window) {
    const meta = (window as any).__TAURI_METADATA__;
    const platform = meta?.platform ?? meta?.os;
    if (platform === 'android' || /android/i.test(String(platform ?? ''))) {
      if (window.innerWidth >= 960 && window.innerHeight >= 540) {
        return true;
      }
    }
    // Fallback Tauri sans metadata : si résolution TV-like (paysage large)
    if (!meta && window.innerWidth >= 1280 && window.innerHeight >= 720) {
      return true;
    }
  }

  // Navigateur standard sur Android avec résolution TV (1280×720 minimum en paysage)
  if (/Android/i.test(userAgent)) {
    if (window.innerWidth >= 1280 && window.innerHeight >= 720 && window.innerWidth > window.innerHeight) {
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

  // Une TV Android ne doit pas être classée comme tablette
  if (/Android/i.test(userAgent) && window.innerWidth > 600 && window.innerWidth < 1280) {
    if (!isAndroidTV()) return true;
  }

  return false;
}

/**
 * Détermine si le plein écran automatique doit être activé.
 * Jellyfin-style: webOS + Android utilisent fullscreen auto pour masquer les barres.
 */
export function shouldAutoFullscreen(): boolean {
  // Tauri Android: toujours activer fullscreen auto (priorité)
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const platform = (window as any).__TAURI_METADATA__?.platform;
    if (platform === 'android') return true;
  }
  return isTVPlatform() || isMobileDevice();
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
