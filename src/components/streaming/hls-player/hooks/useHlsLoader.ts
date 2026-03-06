import { useState, useEffect } from 'preact/hooks';
import Hls from 'hls.js';

/** Applique la config HLS.js type Jellyfin (htmlVideoPlayer requireHlsPlayer) */
function applyJellyfinHlsDefaults(HlsClass: typeof Hls) {
  HlsClass.DefaultConfig.lowLatencyMode = false;
  HlsClass.DefaultConfig.backBufferLength = Infinity;
  HlsClass.DefaultConfig.liveBackBufferLength = 90;
}

export function useHlsLoader() {
  const [hlsLoaded, setHlsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.Hls) {
      applyJellyfinHlsDefaults(window.Hls);
      setHlsLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="hls.js"]');
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.Hls) {
          clearInterval(checkInterval);
          applyJellyfinHlsDefaults(window.Hls);
          setHlsLoaded(true);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 10000);
      return;
    }

    // Import statique : évite le 504 "Outdated Optimize Dep" de Vite en dev
    try {
      applyJellyfinHlsDefaults(Hls);
      (window as unknown as { Hls: typeof Hls }).Hls = Hls;
      setHlsLoaded(true);
    } catch (err) {
      console.error('Erreur lors du chargement de HLS.js:', err);
      setError('Impossible de charger Hls.js');
    }

    return () => {};
  }, []);

  return { hlsLoaded, error };
}
