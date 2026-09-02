/**
 * Persistance backend (DB) pour "Reprendre la lecture" et "Revoir".
 * Le dashboard lit les entrées via API ; le lecteur appelle updateResumeWatching
 * quand la position de lecture change.
 */

import type { ContentItem } from './client/types';
import { serverApi } from './client/server-api';
import { REWATCH_PROGRESS_THRESHOLD } from './resumeProgress';

/** Évènement émis quand la liste change pour forcer les vues à se rafraîchir. */
export const RESUME_WATCHING_EVENT = 'resumeWatching:updated';

/** Métadonnées épisode (séries) sauvegardées avec l'entrée. */
export interface ResumeEpisodeInfo {
  season?: number;
  episode?: number;
  variantId?: string;
  /** Position en secondes pour reprise précise (sinon `progress` % suffit). */
  positionSeconds?: number;
  /** Durée totale de l'épisode en secondes (utile pour calculer le temps restant). */
  durationSeconds?: number;
}

/**
 * Met à jour ou ajoute un média dans la liste "Reprendre / Revoir".
 * À appeler depuis le lecteur (ex. on timeupdate ou on unmount) avec la progression en % (0-100).
 * Si progress >= seuil (générique), on enregistre 100 % → rangée "À revoir".
 *
 * @param item Métadonnées TMDB du média (titre, poster, type, tmdbId).
 * @param progressPercent Pourcentage 0-100.
 * @param episodeInfo Optionnel : saison/épisode/variantId/position pour les séries.
 */
export function updateResumeWatching(
  item: ContentItem,
  progressPercent: number,
  episodeInfo?: ResumeEpisodeInfo,
): void {
  const id = item.id || (item.tmdbId != null ? String(item.tmdbId) : null);
  if (!id) return;

  const clamped = Math.min(100, Math.max(0, progressPercent));
  // Arrêt au générique (~90–95 %) = visionnage terminé.
  const progress = clamped >= REWATCH_PROGRESS_THRESHOLD ? 100 : clamped;

  const now = Date.now();
  void serverApi.upsertResumeWatching({
    content_id: id,
    tmdb_id: item.tmdbId ?? null,
    tmdb_type: item.type,
    title: item.title || '',
    poster: item.poster ?? null,
    progress,
    season: episodeInfo?.season ?? null,
    episode: episodeInfo?.episode ?? null,
    variant_id: episodeInfo?.variantId ?? null,
    position_seconds: episodeInfo?.positionSeconds ?? null,
    duration_seconds: episodeInfo?.durationSeconds ?? null,
    last_watched: now,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RESUME_WATCHING_EVENT));
  }
}

/**
 * Retire un média de la liste (ex. série terminée, ou utilisateur le souhaite).
 */
export function removeResumeWatching(id: string): void {
  if (!id) return;
  void serverApi.removeResumeWatching(id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RESUME_WATCHING_EVENT));
  }
}
