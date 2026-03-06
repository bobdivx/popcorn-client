import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';

const STORAGE_KEY = 'resumeWatching';
const REWATCH_PROGRESS_THRESHOLD = 99;

type StoredItem = ContentItem & { lastWatched: number };

function readStoredItems(): StoredItem[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const data: StoredItem[] = JSON.parse(stored);
    return data.slice().sort((a, b) => b.lastWatched - a.lastWatched);
  } catch {
    return [];
  }
}

export function useResumeWatching() {
  const [allItems, setAllItems] = useState<StoredItem[]>(() => readStoredItems());

  useEffect(() => {
    const stored = readStoredItems();
    setAllItems(stored);
  }, []);

  const { resumeWatching, rewatchWatching, watchedIds } = useMemo(() => {
    const resume: ContentItem[] = [];
    const rewatch: ContentItem[] = [];
    const ids = new Set<string>();

    allItems.forEach(({ lastWatched, ...item }) => {
      const progress = item.progress ?? 0;
      const contentItem = { ...item };
      if (item.id) ids.add(item.id);
      if (item.tmdbId != null) ids.add(String(item.tmdbId));

      if (progress >= REWATCH_PROGRESS_THRESHOLD) {
        rewatch.push(contentItem);
      } else {
        resume.push(contentItem);
      }
    });

    return {
      resumeWatching: resume.slice(0, 10),
      rewatchWatching: rewatch.slice(0, 15),
      watchedIds: ids,
    };
  }, [allItems]);

  return {
    resumeWatching,
    rewatchWatching,
    watchedIds,
  };
}
