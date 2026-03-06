/**
 * Calcule la progression de synchronisation en pourcentage
 * Utilise la même logique que TorrentSyncManager pour garantir la cohérence
 */
export interface SyncProgressData {
  sync_in_progress: boolean;
  stats?: Record<string, number>;
  progress?: {
    total_to_process?: number;
    total_processed?: number;
    /** Nombre de pages déjà récupérées (RSS + recherches) */
    fetched_pages?: number;
    /** Nombre total de pages à traiter pour la catégorie en cours (estimation). Pour % = fetched_pages / total_pages */
    total_pages?: number;
    indexer_torrents?: Record<string, number>;
    fetched_torrents?: number;
  };
}

export function calculateSyncProgress(data: SyncProgressData, previousStats: Record<string, number> = {}): number {
  if (!data.sync_in_progress) return 0;

  const totalPages = data.progress?.total_pages ?? 0;
  const fetchedPages = data.progress?.fetched_pages ?? 0;
  const totalToProcess = data.progress?.total_to_process ?? 0;
  const totalProcessed = data.progress?.total_processed ?? 0;

  // Phase 1 (fetch) : progression par pages (0–50 %)
  const pageProgress = totalPages > 0 && fetchedPages >= 0
    ? Math.min(1, fetchedPages / totalPages)
    : 0;

  // Phase 2 (enrichissement + insertion) : progression par torrents traités (50–100 %)
  const processProgress = totalToProcess > 0
    ? Math.min(1, totalProcessed / totalToProcess)
    : 0;

  // Combiner les deux : 50 % pour le fetch, 50 % pour l'enrichissement/insertion.
  // Quand tous les torrents sont traités (350/350), on affiche 100 %.
  if (totalToProcess > 0) {
    if (processProgress >= 1) return 100;
    const pct = Math.round(50 * pageProgress + 50 * processProgress);
    return Math.min(99, pct);
  }

  // Pas encore de total_to_process (tout en phase fetch) : uniquement par pages
  if (totalPages > 0 && fetchedPages >= 0) {
    return Math.min(100, Math.round(pageProgress * 100));
  }

  // Fallback : ancienne logique
  const totalCurrent = data.stats
    ? Object.values(data.stats).reduce((sum, count) => sum + (count || 0), 0)
    : 0;
  const totalPrevious = Object.values(previousStats || {}).reduce((sum, count) => sum + (count || 0), 0);

  if (data.progress && data.progress.total_to_process && data.progress.total_to_process > 0) {
    const estimatedFinalTotal = data.progress.total_to_process;
    const phases23Progress = Math.min(1, (data.progress.total_processed || 0) / estimatedFinalTotal);
    return Math.round(33 + (phases23Progress * 67));
  }

  const fetchedTotal = data.progress?.indexer_torrents
    ? Object.values(data.progress.indexer_torrents).reduce((sum, n) => sum + (n || 0), 0)
    : (data.progress?.fetched_torrents || 0);

  if (fetchedTotal > 0) {
    return Math.min(33, Math.round((fetchedTotal / 1000) * 33));
  }

  if (totalPrevious === 0) {
    return totalCurrent > 0 ? 10 : 0;
  }

  return Math.min(95, Math.floor((totalCurrent / (totalPrevious * 2)) * 100));
}
