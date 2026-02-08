import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { FilmData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

/**
 * Charge les films triés par date d'ajout sur l'indexeur (ajouts récents)
 */
export function useRecentFilms() {
  const { language } = useI18n();
  const [films, setFilms] = useState<FilmData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const prefs = getLibraryDisplayConfig();
        const res = await serverApi.getFilmsDataPaginated(
          1,
          prefs.torrentsRecentLimit,
          language,
          'recent',
          prefs.showZeroSeedTorrents ? 0 : 1,
          prefs.mediaLanguages,
          prefs.minQuality
        );
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setFilms(res.data);
        }
      } catch {
        if (!cancelled) setFilms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [language]);

  return { films, loading };
}
