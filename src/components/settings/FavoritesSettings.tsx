import { useState, useEffect, useCallback } from 'preact/hooks';
import { Bookmark, Trash2, ExternalLink, Loader2 } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { MediaFavorite } from '../../lib/client/server-api/requests';
import { DsSettingsSectionCard } from '../ui/design-system';

function favKey(fav: MediaFavorite): string {
  return `${fav.tmdb_id}-${fav.tmdb_type}`;
}

export default function FavoritesSettings() {
  const { t, language } = useI18n();
  const [favorites, setFavorites] = useState<MediaFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** Nom affiché par favori : favKey -> title */
  const [titles, setTitles] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await serverApi.listMediaFavorites({ limit: 200 });
      if (res.success && Array.isArray(res.data)) {
        setFavorites(res.data);
      } else {
        setFavorites([]);
      }
    } catch {
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Enrichir les titres : groupe torrent (main_title) puis TMDB si besoin
  useEffect(() => {
    if (favorites.length === 0) {
      setTitles({});
      return;
    }
    const tmdbLang = language?.includes('-') ? language : language === 'fr' ? 'fr-FR' : 'en-US';
    let cancelled = false;
    const next: Record<string, string> = {};
    (async () => {
      for (const fav of favorites) {
        if (cancelled) break;
        const key = favKey(fav);
        try {
          const groupRes = await serverApi.getTorrentGroupByTmdbId(fav.tmdb_id);
          if (cancelled) break;
          const mainTitle = groupRes.success && groupRes.data?.main_title
            ? String(groupRes.data.main_title).trim()
            : '';
          if (mainTitle && mainTitle !== 'Inconnu') {
            next[key] = mainTitle;
            continue;
          }
        } catch {
          // ignorer
        }
        try {
          if (fav.tmdb_type === 'tv') {
            const res = await serverApi.getTmdbTvDetail(fav.tmdb_id, tmdbLang);
            if (res.success && res.data?.name) next[key] = res.data.name;
          } else {
            const res = await serverApi.getTmdbMovieDetail(fav.tmdb_id, tmdbLang);
            if (res.success && res.data?.title) next[key] = res.data.title;
          }
        } catch {
          // garder le fallback
        }
      }
      if (!cancelled) setTitles(next);
    })();
    return () => { cancelled = true; };
  }, [favorites.map((f) => favKey(f)).join(','), language]);

  const handleRemove = async (fav: MediaFavorite) => {
    setRemovingId(fav.id);
    try {
      const res = await serverApi.removeMediaFavorite(fav.tmdb_id, fav.tmdb_type);
      if (res.success) {
        setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
      }
    } finally {
      setRemovingId(null);
    }
  };

  const openDetail = (fav: MediaFavorite) => {
    window.location.href = `/torrents?tmdbId=${fav.tmdb_id}&type=${fav.tmdb_type}`;
  };

  return (
    <DsSettingsSectionCard icon={Bookmark} title={t('settingsPages.favorites.title')} accent="violet">
      <p className="ds-text-tertiary text-sm mb-4">{t('settingsPages.favorites.subtitle')}</p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
        </div>
      ) : favorites.length === 0 ? (
        <p className="ds-text-tertiary text-sm py-4">{t('settingsPages.favorites.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {favorites.map((fav) => (
            <li
              key={fav.id}
              className="flex items-center justify-between gap-3 py-3 px-4 rounded-lg bg-[var(--ds-surface-elevated)] border border-[var(--ds-border-subtle)]"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[var(--ds-text-primary)]">
                  {titles[favKey(fav)] || (fav.tmdb_type === 'tv' ? t('common.serie') : t('common.film')) + ` — TMDB #${fav.tmdb_id}`}
                </span>
                {titles[favKey(fav)] && (
                  <span className="ds-text-tertiary text-sm ml-2">
                    {fav.tmdb_type === 'tv' ? t('common.serie') : t('common.film')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openDetail(fav)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                >
                  <ExternalLink className="h-4 w-4" size={16} />
                  {t('settingsPages.favorites.open')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemove(fav)}
                  disabled={removingId === fav.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                  title={t('playback.watchLaterRemove')}
                >
                  {removingId === fav.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" size={16} />
                  ) : (
                    <Trash2 className="h-4 w-4" size={16} />
                  )}
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DsSettingsSectionCard>
  );
}
