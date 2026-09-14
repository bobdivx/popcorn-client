/**
 * Détecteur de mode conduite Tesla (Drive vs Park).
 * 
 * Tesla bloque automatiquement les éléments <video> en mode Drive en appelant pause()
 * au niveau OS. On peut détecter cela en tentant de lire une vidéo test et observer
 * si elle reste bloquée malgré nos tentatives de play().
 */

export type TeslaDriveMode = 'park' | 'drive' | 'unknown';

interface DetectionResult {
  mode: TeslaDriveMode;
  /** Timestamp de la dernière détection réussie */
  timestamp: number;
  /** Confiance du résultat (0-1) */
  confidence: number;
}

const STORAGE_KEY = 'popcorn_tesla_drive_mode';
const DETECTION_TIMEOUT_MS = 3000;
const RECHECK_INTERVAL_MS = 10000; // Re-vérifier toutes les 10s

/**
 * Tente de détecter si Tesla est en mode Drive en testant un <video> fantôme.
 * 
 * Stratégie:
 * 1. Créer un <video> muted, autoplay avec data: URL court
 * 2. Tenter play() et observer si currentTime avance
 * 3. Si bloqué à 0 malgré play() → Drive
 * 4. Si currentTime > 0 → Park
 */
export async function detectTeslaDriveMode(): Promise<DetectionResult> {
  if (typeof document === 'undefined') {
    return { mode: 'unknown', timestamp: Date.now(), confidence: 0 };
  }

  // Vidéo test: 1 frame noir minimal (data URL)
  const testVideo = document.createElement('video');
  testVideo.muted = true;
  testVideo.autoplay = true;
  testVideo.playsInline = true;
  testVideo.style.position = 'absolute';
  testVideo.style.width = '1px';
  testVideo.style.height = '1px';
  testVideo.style.opacity = '0';
  testVideo.style.pointerEvents = 'none';
  testVideo.style.left = '-9999px';
  
  // Data URL: vidéo WebM 1 frame noir 1x1px (~300 bytes)
  // Fallback: si browser ne supporte pas, on assume Park (fail-safe)
  const canPlayWebM = testVideo.canPlayType('video/webm') !== '';
  if (!canPlayWebM) {
    return { mode: 'park', timestamp: Date.now(), confidence: 0.3 };
  }

  testVideo.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh4QGBA==';

  document.body.appendChild(testVideo);

  return new Promise<DetectionResult>((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (testVideo.parentNode) {
        testVideo.pause();
        testVideo.removeAttribute('src');
        testVideo.load();
        document.body.removeChild(testVideo);
      }
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      // Timeout sans avancement → probablement Drive
      resolve({ mode: 'drive', timestamp: Date.now(), confidence: 0.6 });
    }, DETECTION_TIMEOUT_MS);

    const checkProgress = () => {
      if (resolved) return;
      // Si currentTime > 0, la vidéo avance → Park
      if (testVideo.currentTime > 0.05) {
        resolved = true;
        clearTimeout(timeout);
        cleanup();
        resolve({ mode: 'park', timestamp: Date.now(), confidence: 0.9 });
      }
    };

    testVideo.addEventListener('timeupdate', checkProgress);
    testVideo.addEventListener('playing', () => {
      // Vidéo claim "playing" mais on attend confirmation currentTime > 0
      setTimeout(checkProgress, 500);
      setTimeout(checkProgress, 1000);
      setTimeout(checkProgress, 1500);
    });

    testVideo.addEventListener('error', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      cleanup();
      // Erreur → assume Park (fail-safe, mieux que bloquer)
      resolve({ mode: 'park', timestamp: Date.now(), confidence: 0.4 });
    });

    // Forcer play() explicitement (au cas où autoplay ne suffit pas)
    testVideo.play().catch(() => {
      // play() rejeté → peut être Drive ou autoplay policy
      // On attend quand même le timeout pour décider
    });
  });
}

/**
 * Cache le dernier mode détecté dans localStorage.
 */
export function getCachedDriveMode(): DetectionResult | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as DetectionResult;
      // Cache valide seulement 30s (Tesla peut changer Park↔Drive rapidement)
      if (Date.now() - parsed.timestamp < 30000) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Persiste le mode détecté dans localStorage.
 */
export function setCachedDriveMode(result: DetectionResult): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

/**
 * Détecte le mode avec cache (retourne immédiatement le cache si < 30s, sinon re-détecte).
 */
export async function detectDriveModeWithCache(): Promise<DetectionResult> {
  const cached = getCachedDriveMode();
  if (cached) {
    return cached;
  }
  const result = await detectTeslaDriveMode();
  setCachedDriveMode(result);
  return result;
}

/**
 * Hook de monitoring continu: re-vérifie le mode Park/Drive toutes les 10s.
 * Utile car Tesla peut changer de mode pendant la session.
 * 
 * @param onModeChange Callback appelé quand le mode change
 */
export function startDriveModeMonitoring(onModeChange: (mode: TeslaDriveMode) => void): () => void {
  let currentMode: TeslaDriveMode = 'unknown';
  let intervalId: number | null = null;

  const check = async () => {
    const result = await detectTeslaDriveMode();
    setCachedDriveMode(result);
    if (result.mode !== currentMode && result.mode !== 'unknown' && result.confidence > 0.5) {
      currentMode = result.mode;
      onModeChange(result.mode);
    }
  };

  // Check initial
  void check();

  // Re-check périodique
  intervalId = window.setInterval(check, RECHECK_INTERVAL_MS);

  // Cleanup
  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  };
}
