import { useState, useEffect } from 'preact/hooks';

/** Applique la config HLS.js type Jellyfin (htmlVideoPlayer requireHlsPlayer) */
function applyJellyfinHlsDefaults(HlsClass: any) {
  HlsClass.DefaultConfig.lowLatencyMode = false;
  HlsClass.DefaultConfig.backBufferLength = Infinity;
  HlsClass.DefaultConfig.liveBackBufferLength = 90;
}

export function useHlsLoader() {
  const [hlsLoaded, setHlsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function initHls() {
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

      // Import dynamique au lieu de statique pour alléger le bundle
      try {
        const { default: HlsClass } = await import('hls.js');
        applyJellyfinHlsDefaults(HlsClass);
        (window as any).Hls = HlsClass;
        setHlsLoaded(true);
      } catch (err) {
        console.error('Erreur lors du chargement de HLS.js:', err);
        setError('Impossible de charger Hls.js');
      }
    }

    initHls();

    return () => {};
  }, []);

  return { hlsLoaded, error };
}
