import { useMemo } from 'preact/hooks';
import DiscoverMediaDetail from './DiscoverMediaDetail';
import { useI18n } from '../../lib/i18n';

function getParamsFromLocation(): {
  tmdbId: number | null;
  type: 'movie' | 'tv' | null;
  titleHint: string | null;
} {
  if (typeof window === 'undefined') return { tmdbId: null, type: null, titleHint: null };
  const params = new URLSearchParams(window.location.search);
  const tmdbIdStr = params.get('tmdbId');
  const type = params.get('type') as 'movie' | 'tv' | null;
  const titleRaw = params.get('title');
  const titleHint = titleRaw?.trim() ? titleRaw.trim() : null;
  if (!tmdbIdStr || !type) return { tmdbId: null, type: null, titleHint: null };
  const tmdbId = parseInt(tmdbIdStr, 10);
  if (Number.isNaN(tmdbId)) return { tmdbId: null, type: null, titleHint: null };
  if (type !== 'movie' && type !== 'tv') return { tmdbId: null, type: null, titleHint: null };
  return { tmdbId, type, titleHint };
}

export default function DiscoverMediaDetailRoute() {
  const { t } = useI18n();
  const { tmdbId, type, titleHint } = useMemo(() => getParamsFromLocation(), []);

  if (!tmdbId || !type) {
    return (
      <div class="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <h1 class="text-2xl font-bold mb-3 text-white">
          {t('discover.missingParams')}
        </h1>
        <a href="/dashboard" class="text-primary-400 hover:text-primary-300 font-medium">
          {t('common.back')} {t('nav.home')}
        </a>
      </div>
    );
  }

  return <DiscoverMediaDetail tmdbId={tmdbId} mediaType={type} titleHint={titleHint ?? undefined} />;
}
