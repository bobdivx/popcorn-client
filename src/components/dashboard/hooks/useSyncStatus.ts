import { useState, useEffect, useRef } from 'preact/hooks';
import {
  getSyncStatusStore,
  subscribeSyncStatusStore,
  type SyncStatusStore,
} from '../../../lib/sync-status-store';

/** Délai minimum (ms) pendant lequel on garde la barre visible après que l’API indique "plus de sync", pour éviter le clignotement. */
const SYNC_BAR_STICKY_MS = 4000;

export function useSyncStatus() {
  const [storeState, setStoreState] = useState(() => getSyncStatusStore());
  const [displaySyncing, setDisplaySyncing] = useState(false);
  const stickyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncStatus: SyncStatusStore | null = storeState.status;
  const loading = storeState.loading;

  const isSyncingFromStore = syncStatus ? (() => {
    const syncInProgress = syncStatus.sync_in_progress || false;
    const progress = syncStatus.progress;
    const hasActiveProgress = progress && (
      progress.current_indexer ||
      progress.current_category ||
      (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
    );
    return syncInProgress || hasActiveProgress;
  })() : false;

  useEffect(() => {
    if (isSyncingFromStore) {
      if (stickyTimeoutRef.current) {
        clearTimeout(stickyTimeoutRef.current);
        stickyTimeoutRef.current = null;
      }
      setDisplaySyncing(true);
      return;
    }
    if (displaySyncing && !stickyTimeoutRef.current) {
      stickyTimeoutRef.current = setTimeout(() => {
        stickyTimeoutRef.current = null;
        setDisplaySyncing(false);
      }, SYNC_BAR_STICKY_MS);
    }
  }, [isSyncingFromStore, displaySyncing]);

  useEffect(() => {
    return () => {
      if (stickyTimeoutRef.current) {
        clearTimeout(stickyTimeoutRef.current);
        stickyTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return subscribeSyncStatusStore((s) => setStoreState({ ...s }));
  }, []);

  const isSyncing = displaySyncing;

  return {
    syncStatus,
    isSyncing,
    loading,
  };
}
