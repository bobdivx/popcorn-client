import { useState, useEffect } from 'preact/hooks';

export function useHlsLoader() {
  const [hlsLoaded, setHlsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.Hls) {
      setHlsLoaded(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="hls.js"]');
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.Hls) {
          clearInterval(checkInterval);
          setHlsLoaded(true);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 10000);
      return;
    }

    // Utiliser la version installée via npm
    import('hls.js').then((HlsModule) => {
      window.Hls = HlsModule.default;
      setHlsLoaded(true);
    }).catch((err) => {
      console.error('Erreur lors du chargement de HLS.js:', err);
      // Fallback: charger depuis CDN
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      script.async = true;
      script.onload = () => {
        if (window.Hls) {
          setHlsLoaded(true);
        } else {
          setError('Hls.js chargé mais non disponible');
        }
      };
      script.onerror = () => {
        setError('Impossible de charger Hls.js');
      };
      document.body.appendChild(script);
    });

    return () => {};
  }, []);

  return { hlsLoaded, error };
}
