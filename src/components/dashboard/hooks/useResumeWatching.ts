import { useState, useEffect } from 'preact/hooks';
import type { ContentItem } from '../../../lib/client/types';

export function useResumeWatching() {
  const [resumeWatching, setResumeWatching] = useState<ContentItem[]>([]);

  useEffect(() => {
    loadResumeWatching();
  }, []);

  const loadResumeWatching = () => {
    try {
      const stored = sessionStorage.getItem('resumeWatching');
      if (stored) {
        const data: Array<ContentItem & { lastWatched: number }> = JSON.parse(stored);
        // Trier par dernière lecture et prendre les 10 plus récents
        const sorted = data
          .sort((a, b) => b.lastWatched - a.lastWatched)
          .slice(0, 10)
          .map(({ lastWatched, ...item }) => item); // Retirer lastWatched du résultat
        setResumeWatching(sorted);
      }
    } catch (err) {
      console.error('Erreur lors du chargement de "Reprendre la lecture":', err);
    }
  };

  return {
    resumeWatching,
  };
}
