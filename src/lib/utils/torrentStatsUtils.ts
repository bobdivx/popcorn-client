import type { ClientTorrentStats } from '../client/types';

/**
 * Normalise les stats pour l'affichage :
 * - si state est completed/seeding ou progress >= 0.99, force progress à au moins 0.99
 *   pour éviter d'afficher 0% alors que le fichier est bien téléchargé.
 */
export function normalizeTorrentStats<T extends ClientTorrentStats>(stats: T): T {
  const state = (stats.state ?? '').toString().toLowerCase();
  const progress = typeof stats.progress === 'number' ? stats.progress : 0;
  if (state === 'completed' || state === 'seeding' || progress >= 0.99) {
    if (progress < 0.99) {
      return { ...stats, progress: 1 };
    }
  }
  return stats;
}
