import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { ContentItem } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

const FRESH_LIMIT = 25;

/** Charge une page de torrents triés par date d'ajout indexeur (`sort=recent`). */
export function useFreshSynced(category: 'films' | 'series') {
  const { language } = useI18n();
  const [items, setItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = getLibraryDisplayConfig();
      const minSeeds = prefs.showZeroSeedTorrents ? 0 : 1;
      const res =
        category === 'films'
          ? await serverApi.getFilmsDataPaginated(
              1,
              FRESH_LIMIT,
              language,
              'recent',
              minSeeds,
              prefs.mediaLanguages,
              prefs.minQuality
            )
          : await serverApi.getSeriesDataPaginated(
              1,
              FRESH_LIMIT,
              language,
              'recent',
              minSeeds,
              prefs.mediaLanguages,
              prefs.minQuality
            );
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setItems(res.data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, language]);

  return items;
}
