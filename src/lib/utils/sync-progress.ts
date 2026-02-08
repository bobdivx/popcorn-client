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
    indexer_torrents?: Record<string, number>;
    fetched_torrents?: number;
  };
}

export function calculateSyncProgress(data: SyncProgressData, previousStats: Record<string, number> = {}): number {
  if (!data.sync_in_progress) return 0;
  
  // Calculer la progression en 3 phases :
  // 1. Fetch (récupération) = 0-33%
  // 2. Enrichissement TMDB = 33-66%
  // 3. Insertion DB = 66-100%
  
  // PRIORITÉ : Utiliser les stats réels (torrents insérés en DB) pour la progression
  // car total_processed compte les torrents traités, pas ceux réellement insérés
  const totalCurrent = data.stats
    ? Object.values(data.stats).reduce((sum, count) => sum + (count || 0), 0)
    : 0;
  const totalPrevious = Object.values(previousStats || {}).reduce((sum, count) => sum + (count || 0), 0);
  
  // Si on a une progression détaillée (total_to_process), on est en phases 2-3
  if (data.progress && data.progress.total_to_process && data.progress.total_to_process > 0) {
    // Estimer le total final basé sur total_to_process
    // Mais utiliser les stats réels pour la progression actuelle
    // Si on a déjà inséré des torrents, on est au moins à 33% (fin du fetch)
    const estimatedFinalTotal = data.progress.total_to_process; // Estimation basée sur les torrents récupérés
    
    if (totalCurrent > 0) {
      // On est en phase 2-3 : 33% + (stats_insérés / total_estimé * 67%)
      // Mais on limite à 100% et on utilise le max entre stats et total_processed pour éviter les incohérences
      const maxProgress = Math.max(
        data.progress.total_processed || 0, // Progression du traitement
        totalCurrent // Progression réelle (insérés)
      );
      const phases23Progress = Math.min(1, maxProgress / estimatedFinalTotal);
      return Math.round(33 + (phases23Progress * 67));
    } else {
      // Aucun torrent inséré encore, utiliser total_processed
      const phases23Progress = (data.progress.total_processed || 0) / estimatedFinalTotal;
      return Math.round(33 + (phases23Progress * 67));
    }
  }
  
  // Sinon, utiliser les torrents récupérés (phase fetch) pour estimer la progression
  const fetchedTotal = data.progress?.indexer_torrents
    ? Object.values(data.progress.indexer_torrents).reduce((sum, n) => sum + (n || 0), 0)
    : (data.progress?.fetched_torrents || 0);
  
  if (fetchedTotal > 0) {
    // Phase 1 (fetch) : estimer à 33% max
    // On estime qu'on est à 33% quand on a fetch ~1000 torrents
    return Math.min(33, Math.round((fetchedTotal / 1000) * 33));
  }
  
  // Fallback : utiliser les stats (torrents déjà insérés) - phase 3 terminée
  if (totalPrevious === 0) {
    return totalCurrent > 0 ? 10 : 0;
  }
  
  const estimatedTotal = totalPrevious * 2;
  const progress = Math.min(95, Math.floor((totalCurrent / estimatedTotal) * 100));
  
  return progress;
}
