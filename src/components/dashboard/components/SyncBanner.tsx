import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { calculateSyncProgress } from '../../../lib/utils/sync-progress';
import { useI18n } from '../../../lib/i18n/useI18n';

interface SyncStatus {
  sync_in_progress: boolean;
  progress?: {
    current_indexer?: string | null;
    current_category?: string | null;
    total_processed: number;
    total_to_process: number;
    indexer_torrents?: Record<string, number>;
    category_torrents?: Record<string, number>;
    fetched_torrents?: number;
  };
  stats?: Record<string, number>;
}

export function SyncBanner() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const previousStatsRef = useRef<Record<string, number>>({});

  const loadStatus = async () => {
    try {
      const response = await serverApi.getSyncStatus();
      if (response.success && response.data) {
        const data = response.data;
        const inProgress = data.sync_in_progress === true;
        if (Object.keys(previousStatsRef.current).length === 0 && inProgress) {
          previousStatsRef.current = data.stats || {};
        }
        if (!inProgress && Object.keys(previousStatsRef.current).length > 0) {
          previousStatsRef.current = {};
        }
        setStatus(data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement du statut de sync:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Au repos : 15 s. Pendant une sync : 2 s.
  const POLL_IDLE_MS = 15000;
  const POLL_ACTIVE_MS = 2000;
  const intervalMs = status?.sync_in_progress ? POLL_ACTIVE_MS : POLL_IDLE_MS;

  useEffect(() => {
    const interval = setInterval(loadStatus, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  if (loading || !status?.sync_in_progress) {
    return null;
  }

  // Même calcul que la Navbar et TorrentSyncManager pour cohérence (header 50% = barre 50%)
  const progressPercent = calculateSyncProgress(
    {
      sync_in_progress: true,
      stats: status.stats,
      progress: status.progress,
    },
    previousStatsRef.current
  );

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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-white font-semibold text-sm">
                {t('completeStep.syncInProgress')}
              </span>
              <span className="text-blue-300 text-xs font-medium">
                {progressPercent}%
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
                    {t('syncProgress.currentIndexer')}: <span className="text-blue-300 font-medium">{progress.current_indexer}</span>
                  </span>
                )}
                {progress.current_category && (
                  <span className="capitalize">
                    {t('syncProgress.category')}: <span className="text-blue-300 font-medium">{progress.current_category}</span>
                  </span>
                )}
                {totalTorrents > 0 && (
                  <span className="text-green-300 font-medium">
                    {totalTorrents} {t('syncProgress.torrentsSynced')}
                  </span>
                )}
              </div>
            )}

            {/* Barre toujours visible pendant la sync, avec le même % que le header et les paramètres */}
            <div className="mt-2 w-full flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-0">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>
              <span className="text-blue-300 text-xs font-medium tabular-nums flex-shrink-0 w-10">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        <a
          href="/settings/indexers"
          className="text-blue-300 hover:text-blue-200 text-xs font-medium flex-shrink-0 px-3 py-1 border border-blue-500/50 rounded hover:bg-blue-500/10 transition-colors"
        >
          {t('common.details')}
        </a>
      </div>
    </div>
  );
}
