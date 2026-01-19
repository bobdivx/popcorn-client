import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';

interface SyncStatus {
  sync_in_progress: boolean;
  progress?: {
    current_indexer?: string | null;
    current_category?: string | null;
    total_processed: number;
    total_to_process: number;
    indexer_torrents: Record<string, number>;
    category_torrents: Record<string, number>;
  };
  stats?: Record<string, number>;
}

export function SyncBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      const response = await serverApi.getSyncStatus();
      if (response.success && response.data) {
        setStatus(response.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement du statut de sync:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    
    // Poller toutes les 2 secondes
    const interval = setInterval(() => {
      loadStatus();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading || !status?.sync_in_progress) {
    return null;
  }

  const progress = status.progress;
  const totalTorrents = status.stats 
    ? Object.values(status.stats).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border-b-2 border-blue-500/50 px-4 py-3 animate-fade-in">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 text-blue-400 animate-spin flex-shrink-0" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-semibold text-sm">
                Synchronisation des torrents en cours...
              </span>
              {progress && progress.total_to_process > 0 && (
                <span className="text-blue-300 text-xs">
                  ({progress.total_processed}/{progress.total_to_process})
                </span>
              )}
            </div>
            
            {progress && (
              <div className="flex items-center gap-4 text-xs text-gray-300">
                {progress.current_indexer && (
                  <span className="truncate" title={`Indexer: ${progress.current_indexer}`}>
                    Indexer: <span className="text-blue-300 font-medium">{progress.current_indexer}</span>
                  </span>
                )}
                {progress.current_category && (
                  <span className="capitalize">
                    Catégorie: <span className="text-blue-300 font-medium">{progress.current_category}</span>
                  </span>
                )}
                {totalTorrents > 0 && (
                  <span className="text-green-300 font-medium">
                    {totalTorrents} torrent{totalTorrents > 1 ? 's' : ''} synchronisé{totalTorrents > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
            
            {progress && progress.total_to_process > 0 && (
              <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, (progress.total_processed / progress.total_to_process) * 100)}%` 
                  }}
                />
              </div>
            )}
          </div>
        </div>
        
        <a 
          href="/settings/sync" 
          className="text-blue-300 hover:text-blue-200 text-xs font-medium flex-shrink-0 px-3 py-1 border border-blue-500/50 rounded hover:bg-blue-500/10 transition-colors"
        >
          Voir les détails
        </a>
      </div>
    </div>
  );
}
