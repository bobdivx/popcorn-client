/**
 * Persistance sessionStorage pour "Reprendre la lecture" et "Revoir".
 * Le dashboard lit cette clé via useResumeWatching ; le lecteur doit appeler
 * updateResumeWatching quand la position de lecture change (ex. timeupdate, beforeunload).
 */

import type { ContentItem } from './client/types';

const STORAGE_KEY = 'resumeWatching';
const MAX_ITEMS = 30;

export type StoredResumeItem = ContentItem & { lastWatched: number };

function getStored(): StoredResumeItem[] {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStored(items: StoredResumeItem[]): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // ignore
  }
}

/**
 * Met à jour ou ajoute un média dans la liste "Reprendre / Revoir".
 * À appeler depuis le lecteur (ex. on timeupdate ou on unmount) avec la progression en % (0-100).
 * Si progress >= 99, le média apparaîtra dans la ligne "Revoir" ; sinon dans "Reprendre la lecture".
 */
export function updateResumeWatching(item: ContentItem, progressPercent: number): void {
  const id = item.id || (item.tmdbId != null ? String(item.tmdbId) : null);
  if (!id) return;

  const list = getStored();
  const now = Date.now();
  const entry: StoredResumeItem = {
    ...item,
    progress: Math.min(100, Math.max(0, progressPercent)),
    lastWatched: now,
  };

  const rest = list.filter(
    (x) => x.id !== id && (x.tmdbId == null || String(x.tmdbId) !== id)
  );
  setStored([entry, ...rest]);
}
