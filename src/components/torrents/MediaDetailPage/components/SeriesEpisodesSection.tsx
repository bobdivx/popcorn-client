import { Play, ChevronDown } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n/useI18n';
import type { SeriesEpisodesResponse } from '../../../../lib/client/server-api/media';

export interface SeriesEpisodesSectionProps {
  seriesEpisodes: SeriesEpisodesResponse;
  selectedSeasonNum: number | null;
  selectedEpisodeVariantId: string | null;
  onSelectSeason: (seasonNum: number) => void;
  onSelectEpisode: (episodeVariantId: string) => void;
  savedPlaybackPosition: number | null;
  /** Nombre d'épisodes en bibliothèque (série depuis library) */
  episodesInLibraryCount?: number;
}

/**
 * Section type expérience streaming : l'utilisateur choisit la saison (menu déroulant),
 * puis la liste des épisodes de cette saison s'affiche en dessous.
 */
export function SeriesEpisodesSection({
  seriesEpisodes,
  selectedSeasonNum,
  selectedEpisodeVariantId,
  onSelectSeason,
  onSelectEpisode,
  savedPlaybackPosition,
  episodesInLibraryCount,
}: SeriesEpisodesSectionProps) {
  const { t } = useI18n();
  const hasSavedPosition = savedPlaybackPosition != null && savedPlaybackPosition > 0;
  const currentSeason = selectedSeasonNum != null
    ? seriesEpisodes.seasons.find((s) => s.season === selectedSeasonNum)
    : null;
  const currentEpisode = currentSeason?.episodes.find((e) => e.id === selectedEpisodeVariantId);
  const episodeCount = currentSeason?.episodes?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* Indication épisodes en bibliothèque (série depuis library) */}
      {episodesInLibraryCount != null && episodesInLibraryCount > 0 && (
        <p className="text-sm text-white/70">
          {episodesInLibraryCount === 1
            ? t('library.episodesInLibrary', { count: 1 })
            : t('library.episodesInLibrary_plural', { count: episodesInLibraryCount })}
        </p>
      )}

      {/* Bannière « Reprendre la lecture » quand une position est sauvegardée */}
      {hasSavedPosition && currentEpisode && (
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm"
          role="region"
          aria-label={t('dashboard.resumeWatching')}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 mb-0.5">
              {t('dashboard.resumeWatching')}
            </p>
            <p className="text-lg font-semibold text-white truncate">
              {currentEpisode.episode === 0
                ? t('mediaDetail.fullPack')
                : t('mediaDetail.episodeWithTitle', {
                    number: currentEpisode.episode,
                    title: currentEpisode.name || t('mediaDetail.episodeNumber', { number: currentEpisode.episode }),
                  })}
            </p>
          </div>
        </div>
      )}

      {/* Sélecteur de saison : menu déroulant (comme sur les plateformes de streaming) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="series-season-select" className="text-sm font-semibold text-white/90 shrink-0">
          {t('mediaDetail.season')}
        </label>
        <div className="relative min-w-[180px]">
          <select
            id="series-season-select"
            value={selectedSeasonNum ?? ''}
            onChange={(e) => {
              const num = parseInt(e.currentTarget.value, 10);
              if (!Number.isNaN(num)) onSelectSeason(num);
            }}
            className="w-full appearance-none bg-white/15 hover:bg-white/20 text-white font-medium py-3 pl-4 pr-10 rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
            aria-label={t('mediaDetail.season')}
          >
            {seriesEpisodes.seasons.map((s) => (
              <option key={s.season} value={s.season} className="bg-gray-900 text-white">
                {t('mediaDetail.seasonNumber', { number: s.season })}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/70 pointer-events-none" aria-hidden />
        </div>
      </div>

      {/* Liste des épisodes de la saison sélectionnée — s'affiche dès qu'une saison est choisie */}
      {currentSeason?.episodes?.length ? (
        <section aria-label={t('mediaDetail.episodes')} className="rounded-xl overflow-hidden bg-black/40 border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 bg-white/5">
            <h3 className="text-base font-semibold text-white">
              {t('mediaDetail.episodes')} — {t('mediaDetail.seasonNumber', { number: currentSeason.season })}
              <span className="ml-2 text-sm font-normal text-white/60">({episodeCount})</span>
            </h3>
          </div>
          <ul className="divide-y divide-white/10" role="list">
            {currentSeason.episodes.map((ep) => {
              const isSelected = selectedEpisodeVariantId === ep.id;
              const label =
                ep.episode === 0
                  ? t('mediaDetail.fullPack')
                  : ep.name?.trim()
                    ? t('mediaDetail.episodeWithTitle', {
                        number: ep.episode,
                        title: ep.name,
                      })
                    : t('mediaDetail.episodeNumber', { number: ep.episode });
              return (
                <li key={ep.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEpisode(ep.id)}
                    className={`w-full flex items-center gap-4 px-4 py-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 group ${
                      isSelected
                        ? 'bg-primary-600/40 text-white'
                        : 'hover:bg-white/10 text-white/90'
                    }`}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    <span
                      className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-base font-bold bg-white/20"
                      aria-hidden
                    >
                      {ep.episode === 0 ? '—' : ep.episode}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-base font-medium">{label}</span>
                    <span
                      className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/80 group-hover:bg-primary-500/80'
                      }`}
                      aria-hidden
                    >
                      <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
