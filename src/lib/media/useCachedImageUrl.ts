import { useEffect, useState } from 'preact/hooks';
import { getImageCacheMode, loadCachedImageUrl, peekCachedImageUrl } from './imageCache';

/**
 * URL d'image TMDB pour un background-image CSS, servie depuis le cache persistant des apps
 * (mode « idb » : Tauri Android/TV/desktop, webOS natif). Web https : URL inchangée (Service Worker).
 */
export function useCachedImageUrl(url: string | null | undefined): string | null {
  const initial = (): string | null => {
    if (!url) return null;
    if (getImageCacheMode() !== 'idb') return url;
    return peekCachedImageUrl(url);
  };
  const [state, setState] = useState<{ src: string | null | undefined; out: string | null }>(() => ({ src: url, out: initial() }));
  const current = state.src === url ? state.out : initial();

  useEffect(() => {
    if (!url) {
      setState({ src: url, out: null });
      return;
    }
    if (getImageCacheMode() !== 'idb') {
      setState({ src: url, out: url });
      return;
    }
    const hit = peekCachedImageUrl(url);
    if (hit) {
      setState({ src: url, out: hit });
      return;
    }
    let cancelled = false;
    setState({ src: url, out: null });
    loadCachedImageUrl(url).then((out) => {
      if (!cancelled) setState({ src: url, out });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return current;
}
