import { ChevronDown } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { PackEpisodeKey, PackEpisodesModel } from '../hooks/usePackEpisodes';
import { serverApi } from '../../../../lib/client/server-api';
import { watchedEpisodeKey } from '../../../../lib/streaming/torrent-storage';
import { EpisodeCardsCarousel } from './EpisodeCardsCarousel';

function keyEquals(a: PackEpisodeKey | null, b: PackEpisodeKey): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  return a.kind === 'file' ? a.path === (b as any).path : a.index === (b as any).index;
}

export interface PackEpisodesSectionProps {
  model: PackEpisodesModel;
  tmdbId?: number | null;
  selectedSeason: number | null;
  onSelectSeason: (season: number) => void;
  selectedEpisodeKey: PackEpisodeKey | null;
  onSelectEpisodeKey: (key: PackEpisodeKey) => void;
  /** Si présent, permet d'afficher des vignettes par épisode (fichier local). */
  infoHash?: string | null;
  watchedSet?: Set<string>;
  isTV?: boolean;
}

export function PackEpisodesSection({
  model,
  tmdbId,
  selectedSeason,
  onSelectSeason,
  selectedEpisodeKey,
  onSelectEpisodeKey,
  infoHash,
  watchedSet,
  isTV,
}: PackEpisodesSectionProps) {
  const { t } = useI18n();
  const season = selectedSeason ?? model.seasons[0] ?? null;
  const items = season != null ? model.episodesBySeason.get(season) ?? [] : [];
  const episodeCount = items.length;
  const [tmdbStillByEpisode, setTmdbStillByEpisode] = useState<Record<number, string>>({});
  const [tmdbNameByEpisode, setTmdbNameByEpisode] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (typeof tmdbId !== 'number' || !season) {
        if (!cancelled) setTmdbStillByEpisode({});
        if (!cancelled) setTmdbNameByEpisode({});
        return;
      }
      const res = await serverApi.getTmdbTvSeasonDetail(tmdbId, season, 'fr-FR');
      if (cancelled) return;
      if (!res?.success || !res.data) {
        setTmdbStillByEpisode({});
        setTmdbNameByEpisode({});
        return;
      }
      const episodes = Array.isArray(res.data.episodes) ? res.data.episodes : [];
      const map: Record<number, string> = {};
      const names: Record<number, string> = {};
      for (const ep of episodes) {
        const num = typeof ep?.episode_number === 'number' ? ep.episode_number : null;
        const stillPath = typeof ep?.still_path === 'string' ? ep.still_path : null;
        if (num && stillPath) {
          map[num] = `https://image.tmdb.org/t/p/w780${stillPath}`;
        }
        if (num) {
          const episodeName = typeof ep?.name === 'string' ? ep.name.trim() : '';
          if (episodeName) names[num] = episodeName;
        }
      }
      setTmdbStillByEpisode(map);
      setTmdbNameByEpisode(names);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tmdbId, season]);

  const getPreferredThumb = useMemo(() => {
    return (episodeNumber: number | null, fallback: string | null) => {
      if (episodeNumber != null && tmdbStillByEpisode[episodeNumber]) return tmdbStillByEpisode[episodeNumber];
      return fallback;
    };
  }, [tmdbStillByEpisode]);

  return (
    <section
      aria-label={t('mediaDetail.episodes')}
      className="rounded-2xl overflow-hidden bg-gradient-to-b from-white/10 to-black/30 border border-white/10 backdrop-blur-sm"
      data-pack-episodes
    >
      <div className="px-5 py-4 border-b border-white/10 bg-black/20 flex items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{t('mediaDetail.episodes')}</h3>
          <p className="text-xs text-white/60">
            {t('mediaDetail.seasonNumber', { number: season ?? 1 })} • {episodeCount} {t('mediaDetail.episodes')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-white/60 hidden sm:inline">{t('mediaDetail.season')}</span>
          <div className="relative min-w-[170px]">
            <select
              value={season ?? ''}
              onChange={(e) => {
                const num = parseInt(e.currentTarget.value, 10);
                if (!Number.isNaN(num)) onSelectSeason(num);
              }}
              data-focusable={isTV ? true : undefined}
              tabIndex={0}
              className="w-full appearance-none bg-white/10 hover:bg-white/15 text-white font-semibold py-2.5 pl-4 pr-10 rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
              aria-label={t('mediaDetail.season')}
            >
              {model.seasons.map((s) => (
                <option key={s} value={s} className="bg-gray-900 text-white">
                  {t('mediaDetail.seasonNumber', { number: s })}
                </option>
              ))}
            </select>
            <ChevronDown
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/70 pointer-events-none"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <EpisodeCardsCarousel
        ariaLabel={t('mediaDetail.episodes')}
        items={items.map((ep) => {
          const fallback =
            infoHash && ep.key.kind === 'file'
              ? `/api/media/episode-thumbnail?info_hash=${encodeURIComponent(infoHash)}&path=${encodeURIComponent(
                  ep.sourcePathOrName || ep.subtitle || '',
                )}&t=60&w=480`
              : null;
          const watched =
            typeof tmdbId === 'number' && season != null && ep.episode > 0
              ? watchedSet?.has(watchedEpisodeKey(season, ep.episode)) ?? false
              : false;
          const tmdbEpisodeName =
            typeof ep.episode === 'number' && ep.episode > 0 ? tmdbNameByEpisode[ep.episode] : undefined;
          return {
            key: `${ep.key.kind}:${ep.key.kind === 'file' ? ep.key.path : ep.key.index}`,
            episodeNumber: ep.episode,
            title: tmdbEpisodeName || ep.title,
            subtitle: null,
            thumbnailUrl: getPreferredThumb(typeof ep.episode === 'number' && ep.episode > 0 ? ep.episode : null, fallback),
            watched,
            isSelected: keyEquals(selectedEpisodeKey, ep.key),
            onSelect: () => onSelectEpisodeKey(ep.key),
            isTV,
          };
        })}
      />
    </section>
  );
}

