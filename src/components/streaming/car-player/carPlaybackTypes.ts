/**
 * Types de moteur de lecture disponibles en mode voiture Tesla.
 */
export type CarPlaybackType = 'mjpeg' | 'native-video';

/**
 * Mode de sélection du playback: Auto (détection Drive/Park) ou Manuel (choix utilisateur).
 */
export type CarPlaybackMode = 'auto' | 'manual';

export interface CarPlaybackTypeInfo {
  id: CarPlaybackType;
  label: string;
  description: string;
  /** Fonctionne en mode conduite (Drive) */
  driveCompatible: boolean;
  /** Nécessite feature detection (ex: WebCodecs) */
  requiresFeatureDetect?: boolean;
}

export const CAR_PLAYBACK_TYPES: Record<CarPlaybackType, CarPlaybackTypeInfo> = {
  mjpeg: {
    id: 'mjpeg',
    label: 'MJPEG + Audio',
    description: 'Image MJPEG + audio MP3 — fonctionne en conduite (contourne blocage vidéo Tesla)',
    driveCompatible: true,
  },
  'native-video': {
    id: 'native-video',
    label: 'Vidéo native',
    description: 'Lecteur <video> MP4 standard — bloqué en conduite, OK en parking',
    driveCompatible: false,
  },
};

const STORAGE_KEY_TYPE = 'popcorn_car_playback_type';
const STORAGE_KEY_MODE = 'popcorn_car_playback_mode';

export interface CarPlaybackSettings {
  mode: CarPlaybackMode;
  manualType: CarPlaybackType;
}

/**
 * Récupère les paramètres de playback depuis localStorage.
 * Fallback: mode Auto + MJPEG.
 */
export function getStoredPlaybackSettings(): CarPlaybackSettings {
  if (typeof localStorage === 'undefined') {
    return { mode: 'auto', manualType: 'mjpeg' };
  }
  
  try {
    const storedMode = localStorage.getItem(STORAGE_KEY_MODE);
    const storedType = localStorage.getItem(STORAGE_KEY_TYPE);
    
    return {
      mode: (storedMode === 'auto' || storedMode === 'manual') ? storedMode : 'auto',
      manualType: (storedType === 'mjpeg' || storedType === 'native-video') ? storedType as CarPlaybackType : 'mjpeg',
    };
  } catch {
    return { mode: 'auto', manualType: 'mjpeg' };
  }
}

/**
 * Persiste les paramètres de playback dans localStorage.
 */
export function setStoredPlaybackSettings(settings: CarPlaybackSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_MODE, settings.mode);
    localStorage.setItem(STORAGE_KEY_TYPE, settings.manualType);
  } catch {
    // ignore
  }
}

/**
 * Détermine le type de playback effectif selon le mode et la détection Drive/Park.
 * 
 * @param settings Paramètres utilisateur (Auto/Manuel + type manuel)
 * @param isDrive true si Tesla en mode conduite, false si parking, null si inconnu
 * @returns Type de playback à utiliser
 */
export function resolvePlaybackType(
  settings: CarPlaybackSettings,
  isDrive: boolean | null,
): CarPlaybackType {
  if (settings.mode === 'manual') {
    return settings.manualType;
  }
  
  // Mode Auto
  if (isDrive === true) {
    // Conduite détectée → forcer MJPEG (seul compatible Drive)
    return 'mjpeg';
  } else if (isDrive === false) {
    // Parking détecté → préférer native-video (meilleure qualité)
    return 'native-video';
  } else {
    // Mode inconnu → fallback sûr MJPEG
    return 'mjpeg';
  }
}
