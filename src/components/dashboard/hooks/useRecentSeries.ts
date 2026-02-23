import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SeriesData } from '../../../lib/client/types';
import { useI18n } from '../../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';

/**
 * Charge les séries triées par date de sortie TMDB (firstAirDate), plus récentes en premier
 */
export function useRecentSeries() {
  const { language } = useI18n();
  const [series, setSeries] = useState<SeriesData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const prefs = getLibraryDisplayConfig();
        const res = await serverApi.getSeriesDataPaginated(
          1,
          prefs.torrentsRecentLimit,
          language,
          'release_date',
          prefs.showZeroSeedTorrents ? 0 : 1,
          prefs.mediaLanguages,
          prefs.minQuality
        );
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setSeries(res.data);
        }
      } catch {
        if (!cancelled) setSeries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [language]);

  return { series, loading };
}
