import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../../lib/client/server-api';
import type { SupportedLanguage } from '../../../../lib/i18n/types';

/**
 * Titre canonique TMDB (film : `title`, série : `name`) via notre API discover.
 * Complète les champs torrent souvent incomplets ou tronqués côté indexeur.
 */
export function useTmdbApiTitle(
  tmdbId: number | null | undefined,
  tmdbType: string | null | undefined,
  language: SupportedLanguage
): string | null {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (tmdbId == null || Number.isNaN(Number(tmdbId))) {
      setTitle(null);
      return;
    }
    const type = (tmdbType ?? '').toString().toLowerCase();
    if (type !== 'movie' && type !== 'tv') {
      setTitle(null);
      return;
    }

    const lang = language === 'fr' ? 'fr-FR' : 'en-US';
    let cancelled = false;

    (async () => {
      try {
        const res =
          type === 'movie'
            ? await serverApi.getTmdbMovieDetail(Number(tmdbId), lang)
            : await serverApi.getTmdbTvDetail(Number(tmdbId), lang);
        if (cancelled || !res.success || !res.data) return;
        const d = res.data as Record<string, unknown>;
        const raw =
          type === 'movie'
            ? (d.title as string) || (d.original_title as string) || ''
            : (d.name as string) || (d.original_name as string) || '';
        const next = typeof raw === 'string' ? raw.trim() : '';
        if (next && !cancelled) setTitle(next);
        else if (!cancelled) setTitle(null);
      } catch {
        if (!cancelled) setTitle(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tmdbId, tmdbType, language]);

  return title;
}
