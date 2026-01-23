import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';

interface SyncStatus {
  sync_in_progress: boolean;
  stats?: Record<string, number>;
  progress?: {
    current_indexer?: string | null;
    current_category?: string | null;
    current_query?: string | null;
    indexer_torrents: Record<string, number>;
    category_torrents: Record<string, number>;
    fetched_pages?: number;
    fetched_torrents?: number;
    total_processed: number;
    total_to_process: number;
  };
}

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await serverApi.getSyncStatus();
        if (response.success && response.data) {
          setSyncStatus(response.data);
        }
      } catch (err) {
        console.warn('[USE SYNC STATUS] Erreur lors du chargement du statut:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();

    // Vérifier toutes les 2 secondes si une sync est en cours
    const interval = setInterval(() => {
      loadStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Déterminer si une synchronisation est vraiment en cours
  const isSyncing = syncStatus ? (() => {
    const syncInProgress = syncStatus.sync_in_progress || false;
    const hasStats = syncStatus.stats && Object.keys(syncStatus.stats).length > 0;
    const progress = syncStatus.progress;
    
    const hasActiveProgress = progress && (
      progress.current_indexer || 
      progress.current_category || 
      (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
    );
    
    return syncInProgress || hasActiveProgress || (hasStats && syncInProgress);
  })() : false;

  return {
    syncStatus,
    isSyncing,
    loading,
  };
}
