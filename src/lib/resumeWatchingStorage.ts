/**
 * Persistance localStorage pour "Reprendre la lecture" et "Revoir".
 * Le dashboard lit cette clé via useResumeWatching ; le lecteur appelle
 * updateResumeWatching quand la position de lecture change (timeupdate, beforeunload).
 *
 * Pour les séries, on stocke en plus saison/épisode/variantId/position pour
 * que la rangée puisse afficher le bon "S2E5" et permettre une reprise précise.
 */

import type { ContentItem } from './client/types';

const STORAGE_KEY = 'resumeWatching';
const MAX_ITEMS = 30;

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

export type StoredResumeItem = ContentItem &
  ResumeEpisodeInfo & {
    lastWatched: number;
  };

function getStored(): StoredResumeItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    let raw = localStorage.getItem(STORAGE_KEY);
    // Migration silencieuse depuis l'ancien stockage sessionStorage.
    if (!raw && typeof sessionStorage !== 'undefined') {
      const legacy = sessionStorage.getItem(STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        sessionStorage.removeItem(STORAGE_KEY);
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStored(items: StoredResumeItem[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RESUME_WATCHING_EVENT));
    }
  } catch {
    // ignore
  }
}

/**
 * Met à jour ou ajoute un média dans la liste "Reprendre / Revoir".
 * À appeler depuis le lecteur (ex. on timeupdate ou on unmount) avec la progression en % (0-100).
 * Si progress >= 99, le média apparaîtra dans la ligne "Revoir" ; sinon dans "Reprendre la lecture".
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

  const list = getStored();
  const now = Date.now();
  const entry: StoredResumeItem = {
    ...item,
    progress: Math.min(100, Math.max(0, progressPercent)),
    lastWatched: now,
    ...(episodeInfo?.season != null ? { season: episodeInfo.season } : {}),
    ...(episodeInfo?.episode != null ? { episode: episodeInfo.episode } : {}),
    ...(episodeInfo?.variantId ? { variantId: episodeInfo.variantId } : {}),
    ...(episodeInfo?.positionSeconds != null ? { positionSeconds: episodeInfo.positionSeconds } : {}),
    ...(episodeInfo?.durationSeconds != null ? { durationSeconds: episodeInfo.durationSeconds } : {}),
  };

  const rest = list.filter(
    (x) => x.id !== id && (x.tmdbId == null || String(x.tmdbId) !== id)
  );
  setStored([entry, ...rest]);
}

/**
 * Retire un média de la liste (ex. série terminée, ou utilisateur le souhaite).
 */
export function removeResumeWatching(id: string): void {
  if (!id) return;
  const list = getStored();
  const filtered = list.filter(
    (x) => x.id !== id && (x.tmdbId == null || String(x.tmdbId) !== id)
  );
  if (filtered.length !== list.length) {
    setStored(filtered);
  }
}
