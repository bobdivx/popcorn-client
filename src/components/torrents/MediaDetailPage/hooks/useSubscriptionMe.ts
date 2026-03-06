import { useState, useEffect } from 'preact/hooks';
import { getCachedSubscription, loadSubscription } from '../../../../lib/subscription-store';

/**
 * Retourne l'éligibilité au streaming torrent (option payante).
 * Lit le cache partagé (rempli par la Navbar au chargement) ; déclenche un fetch si cache vide ou expiré.
 */
export function useSubscriptionMe(): { streamingTorrentActive: boolean } {
  const [streamingTorrentActive, setStreamingTorrentActive] = useState(() => {
    const cached = getCachedSubscription();
    return cached?.streamingTorrent === true;
  });

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedSubscription();
    if (cached !== null) {
      setStreamingTorrentActive(cached.streamingTorrent === true);
      return;
    }
    loadSubscription()
      .then((data) => {
        if (cancelled) return;
        setStreamingTorrentActive(data?.streamingTorrent === true);
      })
      .catch(() => {
        if (!cancelled) setStreamingTorrentActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { streamingTorrentActive };
}
