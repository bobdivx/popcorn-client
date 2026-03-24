import { useState, useEffect, useRef } from 'preact/hooks';
import { clientApi } from '../../../lib/client/api';
import type { ClientTorrentStats } from '../../../lib/client/types';

const POLL_INTERVAL = 2000; // 2 secondes

/**
 * Hook pour récupérer les stats de téléchargement d'un torrent par son infoHash
 * Arrête automatiquement le polling si le torrent est complété ou en erreur
 */
export function useTorrentProgress(
  infoHash: string | undefined | null,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const [torrentStats, setTorrentStats] = useState<ClientTorrentStats | null>(null);
  const intervalRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !infoHash) {
      setTorrentStats(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const fetchStats = async () => {
      if (!mountedRef.current) return;
      
      try {
        const stats = await clientApi.getTorrent(infoHash);
        
        if (!mountedRef.current) return;
        
        setTorrentStats(stats);
        
        // Arrêter le polling si le torrent est complété, en erreur, ou n'existe plus
        if (!stats || stats.state === 'completed' || stats.state === 'seeding' || stats.state === 'error') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        // Ignorer silencieusement les erreurs (torrent peut ne pas exister)
        if (mountedRef.current) {
          setTorrentStats(null);
        }
      }
    };

    // Nettoyer l'interval précédent s'il existe
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Premier appel immédiat
    fetchStats();

    // Polling toutes les 2 secondes seulement si le torrent est en cours de téléchargement
    intervalRef.current = window.setInterval(() => {
      fetchStats();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [infoHash, enabled]);

  return { torrentStats };
}
