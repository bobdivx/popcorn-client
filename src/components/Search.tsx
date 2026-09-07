import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { Search as SearchIcon, X, Layers2, CloudDownload, HardDrive, FolderOpen, Film, CheckCircle2, MinusCircle } from 'lucide-preact';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';
import { FocusableCard } from './ui/FocusableCard';
import { useI18n } from '../lib/i18n/useI18n';
import { isTVPlatform } from '../lib/utils/device-detection';
import { tvBrowseItemKey } from '../lib/tv-browse-restore';
import { TvOnScreenKeyboard } from './tv/TvOnScreenKeyboard';
import { DsLoader } from './ui/DsLoader';

const SEARCH_HISTORY_KEY = 'popcorn_search_history';
const SEARCH_HISTORY_MAX = 10;
const SEARCH_CACHE_VERSION = 'v7';

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function countMoviesSeries(items: SearchResult[]): { movies: number; series: number } {
  let movies = 0;
  let series = 0;
  for (const r of items) {
    if (r.type === 'movie') movies += 1;
    else series += 1;
  }
  return { movies, series };
}

export interface SearchLiveProgressState {
  localSkipped: boolean;
  localDone: boolean;
  localMovies: number;
  localSeries: number;
  indexerRunning: boolean;
  indexerDone: boolean;
  indexerMovies: number;
  indexerSeries: number;
  indexerError: boolean;
  tmdbRunning: boolean;
  tmdbDone: boolean;
  tmdbSkipped: boolean;
  tmdbMovies: number;
  tmdbSeries: number;
}

function initialSearchLiveProgress(): SearchLiveProgressState {
  return {
    localSkipped: false,
    localDone: false,
    localMovies: 0,
    localSeries: 0,
    indexerRunning: false,
    indexerDone: false,
    indexerMovies: 0,
    indexerSeries: 0,
    indexerError: false,
    tmdbRunning: false,
    tmdbDone: false,
    tmdbSkipped: false,
    tmdbMovies: 0,
    tmdbSeries: 0,
  };
}

type SearchStepStatus = 'waiting' | 'active' | 'done' | 'skipped' | 'error';

function searchStepStatusLabel(
  status: SearchStepStatus,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case 'active':
      return t('search.progressStatusActive');
    case 'done':
      return t('search.progressStatusDone');
    case 'skipped':
      return t('search.progressStatusSkipped');
    case 'error':
      return t('search.progressStatusError');
    default:
      return t('search.progressStatusWaiting');
  }
}

/** Stepper de recherche : locale → indexeurs → TMDB, pensé pour TV (gros contrastes + barre). */
function SearchLiveProgressTimeline({
  live,
  t,
}: {
  live: SearchLiveProgressState;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const formatCounts = (movies: number, series: number) =>
    t('search.progressCounts', { movies: String(movies), series: String(series) });

  const localActive = !live.localSkipped && !live.localDone;
  const indexerActive = live.indexerRunning && !live.indexerDone && !live.indexerError;
  const tmdbActive = live.tmdbRunning && !live.tmdbDone;

  const localStatus: SearchStepStatus = live.localSkipped
    ? 'skipped'
    : live.localDone
      ? 'done'
      : localActive
        ? 'active'
        : 'waiting';

  const indexerStatus: SearchStepStatus = live.indexerError
    ? 'error'
    : live.indexerDone
      ? 'done'
      : indexerActive
        ? 'active'
        : 'waiting';

  const tmdbStatus: SearchStepStatus = live.tmdbSkipped
    ? 'skipped'
    : live.tmdbDone
      ? 'done'
      : tmdbActive
        ? 'active'
        : 'waiting';

  const steps: Array<{
    id: string;
    index: number;
    label: string;
    status: SearchStepStatus;
    detail?: string;
    Icon: typeof HardDrive;
  }> = [
    {
      id: 'local',
      index: 1,
      label: live.localSkipped ? t('search.progressLocalSkipped') : t('search.progressStepLocal'),
      status: localStatus,
      detail: live.localSkipped
        ? t('search.progressLocalSkippedDetail')
        : live.localDone
          ? formatCounts(live.localMovies, live.localSeries)
          : localActive
            ? t('search.localSearchNote')
            : undefined,
      Icon: HardDrive,
    },
    {
      id: 'indexer',
      index: 2,
      label: t('search.progressStepIndexer'),
      status: indexerStatus,
      detail: live.indexerError
        ? t('search.progressIndexerErrorDetail')
        : live.indexerDone
          ? formatCounts(live.indexerMovies, live.indexerSeries)
          : indexerActive
            ? t('search.indexerSearchNote')
            : undefined,
      Icon: Layers2,
    },
    {
      id: 'tmdb',
      index: 3,
      label: t('search.progressStepTmdb'),
      status: tmdbStatus,
      detail: live.tmdbSkipped
        ? live.indexerError
          ? t('search.progressTmdbSkippedIndexerFail')
          : t('search.progressTmdbSkippedDetail')
        : live.tmdbDone && !live.tmdbSkipped
          ? live.tmdbMovies + live.tmdbSeries > 0
            ? formatCounts(live.tmdbMovies, live.tmdbSeries)
            : t('search.progressTmdbNoneDetail')
          : tmdbActive
            ? t('search.searchingTmdbShort')
            : undefined,
      Icon: Film,
    },
  ];

  const currentStep =
    steps.find((s) => s.status === 'active') ??
    steps.find((s) => s.status === 'waiting') ??
    steps[steps.length - 1];
  const completedCount = steps.filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'error').length;
  const progressPct = Math.min(100, Math.round(((completedCount + (currentStep?.status === 'active' ? 0.45 : 0)) / steps.length) * 100));

  return (
    <div className="mt-4 tv:mt-6 space-y-4 tv:space-y-6" aria-live="polite" aria-label={t('search.progressAriaLabel')}>
      <div className="flex items-center justify-between gap-3 text-sm tv:text-lg text-[var(--ds-text-secondary)]">
        <span className="font-semibold text-[var(--ds-text-primary)]">
          {t('search.progressStepOf', { current: String(currentStep.index), total: String(steps.length) })}
        </span>
        <span className="tabular-nums font-medium">{progressPct}%</span>
      </div>

      <div
        className="relative h-2 tv:h-3 rounded-full bg-[var(--ds-surface)] border border-[var(--ds-border)] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--ds-accent-violet)] transition-[width] duration-500 ease-out search-progress-fill"
          style={{ width: `${Math.max(progressPct, 8)}%` }}
        />
      </div>

      <ol className="grid gap-2.5 tv:gap-4">
        {steps.map((step) => {
          const { status, Icon } = step;
          const isActive = status === 'active';
          const isDone = status === 'done';
          const isError = status === 'error';
          const isSkipped = status === 'skipped';
          const isWaiting = status === 'waiting';

          return (
            <li
              key={step.id}
              className={`relative flex items-center gap-3 tv:gap-5 rounded-2xl border px-3 py-3 tv:px-6 tv:py-5 transition-all duration-300 ${
                isActive
                  ? 'border-[var(--ds-accent-violet)]/70 bg-[var(--ds-accent-violet)]/10 shadow-[0_0_0_1px_rgba(139,92,246,0.25)] scale-[1.01] tv:scale-[1.02]'
                  : isDone
                    ? 'border-emerald-500/35 bg-emerald-500/5'
                    : isError
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : isSkipped
                        ? 'border-[var(--ds-border)] bg-[var(--ds-surface)]/60 opacity-70'
                        : 'border-[var(--ds-border)] bg-[var(--ds-surface)]/40 opacity-55'
              }`}
            >
              <div
                className={`relative shrink-0 flex items-center justify-center w-11 h-11 tv:w-16 tv:h-16 rounded-full border-2 transition-colors duration-300 ${
                  isActive
                    ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-accent-violet)]/20 text-[var(--ds-accent-violet)]'
                    : isDone
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : isError
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                        : 'border-[var(--ds-border-strong)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-tertiary)]'
                }`}
                aria-hidden
              >
                {isActive ? (
                  <DsLoader size="sm" className="text-[var(--ds-accent-violet)]" />
                ) : isDone ? (
                  <CheckCircle2 className="w-6 h-6 tv:w-8 tv:h-8 animate-fade-in" strokeWidth={2.25} />
                ) : isError || isSkipped ? (
                  <MinusCircle className="w-6 h-6 tv:w-8 tv:h-8" strokeWidth={2} />
                ) : (
                  <span className="text-base tv:text-2xl font-bold tabular-nums">{step.index}</span>
                )}
                {isActive ? (
                  <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--ds-accent-violet)]/50 animate-ping opacity-40" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 tv:gap-3">
                  <Icon
                    className={`w-4 h-4 tv:w-6 tv:h-6 shrink-0 ${
                      isActive
                        ? 'text-[var(--ds-accent-violet)]'
                        : isDone
                          ? 'text-emerald-400'
                          : 'text-[var(--ds-text-tertiary)]'
                    }`}
                    strokeWidth={2}
                  />
                  <span
                    className={`font-semibold text-sm tv:text-2xl leading-snug ${
                      isWaiting ? 'text-[var(--ds-text-secondary)]' : 'text-[var(--ds-text-primary)]'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 tv:px-3.5 tv:py-1 text-[10px] tv:text-sm font-bold uppercase tracking-wide ${
                      isActive
                        ? 'bg-[var(--ds-accent-violet)]/20 text-[var(--ds-accent-violet)]'
                        : isDone
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isError
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-tertiary)]'
                    }`}
                  >
                    {searchStepStatusLabel(status, t)}
                  </span>
                </div>
                {step.detail ? (
                  <p
                    key={`${step.id}-${step.detail}`}
                    className="mt-1 tv:mt-2 text-xs tv:text-lg text-[var(--ds-text-tertiary)] animate-fade-in"
                  >
                    {step.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, SEARCH_HISTORY_MAX)
      : [];
  } catch {
    return [];
  }
}

function addSearchToHistory(term: string): void {
  const t = term.trim();
  if (!t) return;
  const prev = getSearchHistory();
  const next = [t, ...prev.filter((x) => x !== t)].slice(0, SEARCH_HISTORY_MAX);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

interface SearchProps {
  onResultClick?: (result: SearchResult) => void;
}

interface SearchResultPosterProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
}

/** Pastille type EpisodeCards (« ÉPISODE n ») : indexer connu ou origine biblio / base sync. */
function SearchIndexerBadge({
  result,
  t,
}: {
  result: SearchResult;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const raw = result.indexerName?.trim();
  if (raw) {
    const display = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
    return (
      <span
        className="inline-block max-w-[10rem] sm:max-w-[11rem] px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-bold tracking-wide bg-black/50 border border-white/15 text-white/95 truncate backdrop-blur-md"
        title={raw}
        aria-label={raw}
      >
        {display}
      </span>
    );
  }

  if (result.sourceSearch === 'library') {
    const label = t('search.badgeLibrary');
    return (
      <span
        className="inline-block max-w-[9rem] px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-bold tracking-wide bg-black/50 border border-white/15 text-white/95 truncate backdrop-blur-md"
        title={t('search.badgeLibraryHint')}
        aria-label={label}
      >
        {label}
      </span>
    );
  }

  if (result.sourceSearch === 'sync') {
    const label = t('search.badgeSyncedDb');
    return (
      <span
        className="inline-block max-w-[10rem] px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-bold tracking-wide bg-black/50 border border-white/15 text-white/95 truncate backdrop-blur-md"
        title={label}
        aria-label={label}
      >
        {label}
      </span>
    );
  }

  if (result.sourceSearch === 'indexer') {
    const label = t('search.badgeIndexer');
    return (
      <span
        className="inline-block max-w-[10rem] px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-bold tracking-wide bg-black/50 border border-white/15 text-white/95 truncate backdrop-blur-md"
        title={label}
        aria-label={label}
      >
        {label}
      </span>
    );
  }

  return null;
}

/** Même vocabulaire visuel que les pastilles épisode (EpisodeCardsCarousel) : ambre = indexeur, bleu = disque, primary = releases. */
function SearchResultAvailability({
  result,
  t,
  showDownloadedBadge,
}: {
  result: SearchResult;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Icône disque alignée avec les pastilles, en bas à droite */
  showDownloadedBadge?: boolean;
}) {
  const v = result.variantCount ?? 0;
  const ei = result.episodesIndexerCount ?? 0;
  const el = result.episodesLibraryCount ?? 0;
  const sc = result.seasonCount;

  type PillKind = 'indexer' | 'library' | 'variants' | 'meta';

  type PillCfg = {
    Icon: typeof Layers2;
    n: number;
    hint: string;
    kind: PillKind;
  };

  const pills: PillCfg[] = [];

  if (result.type === 'movie') {
    if (v > 0)
      pills.push({
        Icon: Layers2,
        n: v,
        hint: t('search.cardVariantsIndexer', { count: v }),
        kind: 'variants',
      });
  } else {
    if (ei > 0) {
      pills.push({
        Icon: CloudDownload,
        n: ei,
        hint: t('search.cardEpisodesIndexer', { count: ei }),
        kind: 'indexer',
      });
    } else if (v > 0) {
      pills.push({
        Icon: Layers2,
        n: v,
        hint: t('search.cardVariantsIndexer', { count: v }),
        kind: 'variants',
      });
    }
    if (el > 0) {
      pills.push({
        Icon: HardDrive,
        n: el,
        hint: t('search.cardEpisodesLibrary', { count: el }),
        kind: 'library',
      });
    }
    if (typeof sc === 'number' && sc > 0) {
      pills.push({
        Icon: FolderOpen,
        n: sc,
        hint: t('search.cardSeasonsInDb', { count: sc }),
        kind: 'meta',
      });
    }
  }

  if (pills.length === 0 && !showDownloadedBadge) return null;

  const capsule = (kind: PillKind): string => {
    switch (kind) {
      case 'indexer':
        return 'bg-amber-500/80 border-amber-400/50 shadow-lg';
      case 'library':
        return 'bg-blue-500/80 border-blue-400/50 shadow-lg';
      case 'variants':
        return 'bg-primary-600/85 border-primary-400/50 shadow-primary';
      default:
        return 'bg-black/50 border-white/15 shadow-md';
    }
  };

  return (
    <div
      className="pointer-events-none absolute left-3 right-3 bottom-3 tv:left-4 tv:right-4 tv:bottom-4 z-20 flex flex-wrap gap-1.5 justify-end items-center"
      role="group"
      aria-label={
        pills.length > 0 && showDownloadedBadge
          ? `${t('search.cardAvailabilityGroup')} — ${t('search.downloaded') || ''}`
          : pills.length > 0
            ? t('search.cardAvailabilityGroup')
            : t('search.downloaded') || ''
      }
    >
      {pills.map((p, i) => (
        <span
          key={`${i}-${p.hint}`}
          title={p.hint}
          aria-label={p.hint}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 tv:px-3 tv:py-1.5 backdrop-blur-md ${capsule(p.kind)}`}
        >
          <p.Icon className="w-3.5 h-3.5 tv:w-4 tv:h-4 text-white shrink-0" strokeWidth={2.5} aria-hidden />
          <span className="text-[10px] tv:text-sm font-bold tabular-nums leading-none text-white">{p.n}</span>
        </span>
      ))}
      {showDownloadedBadge ? (
        <span
          className="inline-flex items-center justify-center p-1.5 tv:p-2 rounded-full bg-blue-500/80 border border-blue-400/50 shadow-lg shrink-0 backdrop-blur-md"
          title={t('search.downloaded') || 'En bibliothèque'}
          aria-label={t('search.downloaded') || 'En bibliothèque'}
        >
          <HardDrive className="w-4 h-4 tv:w-[18px] tv:h-[18px] text-white" strokeWidth={2.5} />
        </span>
      ) : null}
    </div>
  );
}

/** Ajoute `title` à une URL discover pour que le backend résolve le groupe (slug) même si TMDB diffère. */
function withDiscoverTitleHint(path: string, title?: string): string {
  const t = title?.trim();
  if (!t) return path;
  return `${path}${path.includes('?') ? '&' : '?'}title=${encodeURIComponent(t)}`;
}

/** URL de détail : torrents si dispo (bibliothèque / indexeur), sinon Discover (demande). */
function getDetailUrl(result: SearchResult): string {
  // Résultat TMDB pur (fallback « Demander ») → Discover
  if (result.id?.startsWith('tmdb-') && result.tmdbId != null) {
    return withDiscoverTitleHint(`/discover?tmdbId=${result.tmdbId}&type=${result.type}`, result.title);
  }

  const typeParam = result.type === 'tv' ? 'tv' : 'movie';
  const titleQ = result.title ? `&title=${encodeURIComponent(result.title)}` : '';

  // Déjà en bibliothèque ou trouvé via indexeur/sync → page torrents (pas Discover/Demander)
  if (result.tmdbId != null) {
    if (
      result.isDownloaded ||
      result.sourceSearch === 'indexer' ||
      result.sourceSearch === 'sync' ||
      result.sourceSearch === 'library' ||
      (result.episodesIndexerCount ?? 0) > 0
    ) {
      return `/torrents?tmdbId=${result.tmdbId}&type=${typeParam}&from=search${titleQ}`;
    }
    // Autre cas avec tmdbId mais sans preuve de torrent → Discover
    return withDiscoverTitleHint(`/discover?tmdbId=${result.tmdbId}&type=${result.type}`, result.title);
  }

  return `/torrents?slug=${encodeURIComponent(result.id)}&from=search`;
}

/** Carte résultat — même chrome / densite que DownloadCard (grille 16:9). */
function SearchResultPoster({ result, onClick }: SearchResultPosterProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(result.poster || null);
  const detailUrl = getDetailUrl(result);
  const showChrome = isHovered || isFocused;

  useEffect(() => {
    if (result.poster && result.poster !== imageUrl) {
      setImageUrl(result.poster);
    }
  }, [result.poster]);

  const handleClick = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    if (onClick) {
      onClick(result);
    } else {
      window.location.href = detailUrl;
    }
  };

  return (
    <div
      className="relative w-full max-w-full h-full torrent-poster cursor-pointer"
      data-tv-item-key={tvBrowseItemKey(result)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        ariaLabel={result.title}
        className={`group text-left rounded-2xl tv:rounded-3xl overflow-hidden border transition-[border-color,box-shadow,transform,background-color] duration-300 focus:outline-none w-full h-full block ${
          showChrome
            ? 'border-[var(--ds-accent-violet)]/55 bg-[var(--ds-accent-violet-muted)] shadow-[0_18px_48px_rgba(0,0,0,0.35)]'
            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
        }`}
        onClick={handleClick}
        href={onClick ? undefined : detailUrl}
        tabIndex={0}
        onFocus={(e) => {
          setIsFocused(true);
          (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }}
        onBlur={() => setIsFocused(false)}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-700 ease-out ${
                showChrome ? 'scale-105' : 'scale-100'
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-white/10 via-black/50 to-black/90 z-0 p-2 text-white/25">
              <Film className="w-10 h-10 tv:w-14 tv:h-14 mb-2 shrink-0" size={48} />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10 z-10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,106,225,0.18),transparent_55%)] z-10 pointer-events-none" />

          <div className="absolute left-3 top-3 tv:left-4 tv:top-4 z-20 flex flex-wrap gap-1.5 items-start max-w-[70%]">
            <SearchIndexerBadge result={result} t={t} />
            <span className="px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-semibold tracking-wide bg-black/50 border border-white/12 text-white/85 backdrop-blur-md capitalize">
              {result.type === 'movie' ? t('common.film') : t('common.serie')}
            </span>
          </div>

          {!showChrome || !result.overview ? (
            <SearchResultAvailability result={result} t={t} showDownloadedBadge={result.isDownloaded === true} />
          ) : null}

          {showChrome && result.overview ? (
            <div className="absolute inset-0 z-[18] bg-gradient-to-b from-black/10 via-black/45 to-black/85 flex flex-col justify-end p-3 tv:p-5 pointer-events-none">
              <p className="text-xs tv:text-base text-white/90 line-clamp-3 leading-snug">{result.overview}</p>
            </div>
          ) : null}
        </div>

        <div className="p-3 sm:p-4 tv:p-5 relative z-10 text-left">
          <div
            className="text-sm sm:text-base tv:text-xl font-semibold text-white/95 line-clamp-2 leading-snug"
            title={result.title}
          >
            {result.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs tv:text-sm text-white/55 mt-2">
            {result.year ? <span className="tabular-nums">{result.year}</span> : null}
            {result.year ? <span className="w-1 h-1 rounded-full bg-white/25" /> : null}
            <span className="capitalize">{result.type === 'movie' ? t('common.film') : t('common.serie')}</span>
            {result.isDownloaded ? (
              <>
                <span className="w-1 h-1 rounded-full bg-white/25" />
                <span>{t('search.downloaded')}</span>
              </>
            ) : null}
          </div>
        </div>
      </FocusableCard>
    </div>
  );
}

function SearchResultsSection({
  title,
  results,
  onResultClick,
  initialFocus = false,
}: {
  title: string;
  results: SearchResult[];
  onResultClick?: (result: SearchResult) => void;
  initialFocus?: boolean;
}) {
  if (results.length === 0) return null;
  return (
    <section className="px-4 sm:px-8 lg:px-12 mb-8 tv:mb-10">
      <h2 className="text-base sm:text-lg tv:text-2xl font-semibold text-white/90 mb-3 tv:mb-5">{title}</h2>
      <div
        className="dl-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 tv:grid-cols-3 gap-4 sm:gap-5 tv:gap-8"
        data-tv-list
      >
        {results.map((result, index) => (
          <div
            key={result.id}
            data-tv-list-item
            data-tv-initial-focus={initialFocus && index === 0 ? true : undefined}
            className="min-w-0"
          >
            <SearchResultPoster result={result} onClick={onResultClick} />
          </div>
        ))}
      </div>
    </section>
  );
}

function normalizeForSearchMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9À-ÿ\u00C0-\u024F\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Score 0–100 : à quel point le titre colle à la requête (sans bonus poster / bibliothèque). */
function titleQueryMatchScore(query: string, title: string): number {
  const q = normalizeForSearchMatch(query);
  const tn = normalizeForSearchMatch(title);
  if (!q || !tn) return 0;

  const qWords = q.split(' ').filter((w) => w.length >= 2);
  if (qWords.length === 0) return 0;

  if (tn === q) return 100;
  if (tn.startsWith(q) || q.startsWith(tn)) return 93;
  if (tn.includes(q)) return 88 - Math.min(28, Math.max(0, tn.length - q.length) * 1.2);

  let matched = 0;
  const titleWords = new Set(tn.split(' ').filter((w) => w.length >= 2));
  for (const w of qWords) {
    if (titleWords.has(w)) {
      matched += 1;
      continue;
    }
    for (const tw of titleWords) {
      if (tw.includes(w) || w.includes(tw)) {
        matched += 0.55;
        break;
      }
    }
  }
  let score = (matched / qWords.length) * 78;
  const significant = qWords.filter((w) => w.length >= 4);
  if (significant.length > 0 && significant.every((w) => tn.includes(w))) {
    score = Math.max(score, 72);
  }
  return score;
}

/** Tri final : titre + petite prime bibliothèque / affichage. */
function searchResultRank(result: SearchResult, query: string): number {
  let s = titleQueryMatchScore(query, result.title);
  if (result.isDownloaded) s += 15;
  if (result.poster) s += 2;
  return s;
}

function pickBetterDuplicateForQuery(a: SearchResult, b: SearchResult, query: string): SearchResult {
  const ta = titleQueryMatchScore(query, a.title);
  const tb = titleQueryMatchScore(query, b.title);

  let chosen: SearchResult;
  let other: SearchResult;

  if (tb > ta) {
    chosen = b;
    other = a;
  } else if (ta > tb) {
    chosen = a;
    other = b;
  } else if (a.isDownloaded && !b.isDownloaded) {
    chosen = a;
    other = b;
  } else if (b.isDownloaded && !a.isDownloaded) {
    chosen = b;
    other = a;
  } else if (a.poster && !b.poster) {
    chosen = a;
    other = b;
  } else if (b.poster && !a.poster) {
    chosen = b;
    other = a;
  } else {
    chosen = a;
    other = b;
  }

  const rank = (s?: SearchResult['sourceSearch']) =>
    s === 'indexer' ? 3 : s === 'sync' ? 2 : s === 'library' ? 1 : 0;
  const sourceSearch =
    rank(chosen.sourceSearch) >= rank(other.sourceSearch)
      ? chosen.sourceSearch ?? other.sourceSearch
      : other.sourceSearch ?? chosen.sourceSearch;
  const mergedName =
    chosen.indexerName?.trim() || other.indexerName?.trim() || undefined;

  return { ...chosen, sourceSearch, indexerName: mergedName };
}

/**
 * Déduplication par TMDB (ou titre+type), choix de la meilleure variante pour la requête,
 * puis tri par pertinence (le titre qui correspond le plus en premier).
 */
function groupAndRankSearchResults(results: SearchResult[], query: string): SearchResult[] {
  const q = query.trim();
  const groups = new Map<string, SearchResult>();

  for (const r of results) {
    const key =
      r.tmdbId && r.tmdbId > 0 ? `${r.tmdbId}-${r.type}` : `${r.title.toLowerCase().trim()}-${r.type}`;

    const existing = groups.get(key);
    if (!existing) groups.set(key, r);
    else groups.set(key, pickBetterDuplicateForQuery(existing, r, q));
  }

  return Array.from(groups.values()).sort((a, b) => searchResultRank(b, q) - searchResultRank(a, q));
}

type SearchPhase = 'idle' | 'local' | 'indexer' | 'tmdb';

export default function Search({ onResultClick }: SearchProps) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | 'movie' | 'tv'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tmdbFallbackResults, setTmdbFallbackResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [searchLive, setSearchLive] = useState<SearchLiveProgressState>(() => initialSearchLiveProgress());
  const [error, setError] = useState<string | null>(null);
  const [forceIndexerSearch] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef(false);
  const isTV = isTVPlatform();

  useEffect(() => {
    if (isTVPlatform()) return;
    if (inputRef.current && typeof window !== 'undefined') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  // Organiser les résultats par type (déclaré avant le useEffect qui en dépend)
  // Regrouper par TMDB ID pour éviter les doublons
  const groupedResults = useMemo(
    () => groupAndRankSearchResults(results, query.trim()),
    [results, query],
  );

  const sortedTmdbFallback = useMemo(
    () =>
      [...tmdbFallbackResults].sort(
        (a, b) => searchResultRank(b, query.trim()) - searchResultRank(a, query.trim()),
      ),
    [tmdbFallbackResults, query],
  );
  const movies = groupedResults.filter(r => r.type === 'movie');
  const series = groupedResults.filter(r => r.type === 'tv');
  const allResults = type === 'all' ? groupedResults : (type === 'movie' ? movies : series);
  const isInLibrary = (r: SearchResult) => r.sourceSearch === 'library' || r.isDownloaded === true;
  const libraryResults = allResults.filter(isInLibrary);
  const catalogMovies = movies.filter((r) => !isInLibrary(r) && (type === 'all' || type === 'movie'));
  const catalogSeries = series.filter((r) => !isInLibrary(r) && (type === 'all' || type === 'tv'));

  // Après validation de la recherche (OK / Enter) : déplacer le focus sur le premier résultat (TV / télécommande)
  useEffect(() => {
    const hadLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (!isTVPlatform()) return;
    const hasResults = allResults.length > 0 || tmdbFallbackResults.length > 0;
    if (!hasResults || loading) return;
    const focusOnInput = document.activeElement === inputRef.current;
    const focusOnKeyboard = !!document.activeElement?.closest('[data-tv-keyboard]');
    const justFinishedLoading = hadLoading;
    if (!justFinishedLoading && !focusOnInput && !focusOnKeyboard) return;
    const t = setTimeout(() => {
      const first = document.querySelector<HTMLElement>(
        '[data-search-results] a[href], [data-search-results] [data-focusable], [data-search-results] [tabindex="0"]'
      );
      if (first) {
        first.focus();
      }
    }, 200);
    return () => clearTimeout(t);
  }, [loading, allResults.length, tmdbFallbackResults.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q && q.trim()) setQuery(q.trim());
  }, []);

  const handleSearch = useCallback(async (termOverride?: string) => {
    const searchTerm = (termOverride ?? query).trim();
    if (!searchTerm) {
      setResults([]);
      return;
    }
    setQuery(searchTerm);
    addSearchToHistory(searchTerm);
    setSearchHistory(getSearchHistory());

    const cacheKey = `search_${SEARCH_CACHE_VERSION}_${searchTerm}_${type}_${language}${forceIndexerSearch ? '_indexer' : ''}`;
    const cached = CacheManager.get<SearchResult[]>(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSearchLive(initialSearchLiveProgress());

      const typeParam = undefined;

      if (!serverApi.isAuthenticated()) {
        setError(t('search.mustBeLoggedIn'));
        setSearchPhase('idle');
        setSearchLive(initialSearchLiveProgress());
        setLoading(false);
        return;
      }

      /** Recherche directe indexeurs (sans étape locale) */
      if (forceIndexerSearch) {
        setSearchPhase('indexer');
        setSearchLive({
          ...initialSearchLiveProgress(),
          localSkipped: true,
          indexerRunning: true,
        });
        await yieldToPaint();

        const indexerRes = await serverApi.search({
          q: searchTerm,
          type: typeParam,
          source: 'indexer',
          lang: language,
          user_id: serverApi.getCurrentUserId() || undefined,
        });

        const finalizeTmdbSkipped = () => {
          setSearchLive((prev) => ({
            ...prev,
            tmdbSkipped: true,
            tmdbDone: true,
            tmdbMovies: 0,
            tmdbSeries: 0,
            tmdbRunning: false,
          }));
        };

        if (!indexerRes.success) {
          setError(indexerRes.message || t('search.indexerSearchError'));
          setSearchLive((prev) => ({
            ...prev,
            indexerRunning: false,
            indexerError: true,
            indexerDone: false,
          }));
          finalizeTmdbSkipped();
          setLoading(false);
          setSearchPhase('idle');
          return;
        }

        const indexerData = indexerRes.data ?? [];
        const idxCounts = countMoviesSeries(indexerData);
        setSearchLive((prev) => ({
          ...prev,
          indexerRunning: false,
          indexerDone: true,
          indexerError: false,
          indexerMovies: idxCounts.movies,
          indexerSeries: idxCounts.series,
        }));
        setResults(indexerData);
        CacheManager.set(cacheKey, indexerData, 60 * 60 * 1000);
        setTmdbFallbackResults([]);
        await yieldToPaint();

        if (indexerData.length === 0 && searchTerm) {
          setSearchPhase('tmdb');
          setSearchLive((prev) => ({ ...prev, tmdbRunning: true }));
          await yieldToPaint();

          const tmdbLang = language === 'fr' ? 'fr-FR' : 'en-US';
          const tmdbRes = await serverApi.searchTmdb({
            q: searchTerm,
            type: typeParam,
            language: tmdbLang,
            page: 1,
          });

          let mapped: SearchResult[] = [];
          if (tmdbRes.success && tmdbRes.data && tmdbRes.data.length > 0) {
            mapped = tmdbRes.data.map((r: Record<string, unknown>) => ({
              id: String(r.id ?? `tmdb-${r.tmdbId}-${r.type}`),
              title: String(r.title ?? ''),
              type: ((r.type as string) === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
              poster: r.poster as string | undefined,
              year: r.year as number | undefined,
              overview: r.overview as string | undefined,
              tmdbId: Number(r.tmdbId ?? 0),
            }));
            setTmdbFallbackResults(mapped);
          } else {
            setTmdbFallbackResults([]);
          }
          const tm = countMoviesSeries(mapped);
          setSearchLive((prev) => ({
            ...prev,
            tmdbRunning: false,
            tmdbDone: true,
            tmdbSkipped: false,
            tmdbMovies: tm.movies,
            tmdbSeries: tm.series,
          }));
        } else {
          finalizeTmdbSkipped();
        }
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      setSearchPhase('local');
      await yieldToPaint();

      const localRes = await serverApi.search({
        q: searchTerm,
        type: typeParam,
        source: 'local',
        lang: language,
      });

      if (!localRes.success) {
        setError(localRes.message || 'Erreur lors de la recherche');
        setSearchLive(initialSearchLiveProgress());
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      const localData = localRes.data ?? [];
      const localCounts = countMoviesSeries(localData);
      setSearchLive((prev) => ({
        ...prev,
        localDone: true,
        localMovies: localCounts.movies,
        localSeries: localCounts.series,
        indexerRunning: true,
      }));
      if (localData.length > 0) {
        setResults(localData);
        setTmdbFallbackResults([]);
      }

      await yieldToPaint();

      const finalizeSkipTmdb = () => {
        setSearchLive((prev) => ({
          ...prev,
          tmdbSkipped: true,
          tmdbDone: true,
          tmdbMovies: 0,
          tmdbSeries: 0,
          tmdbRunning: false,
        }));
      };

      setSearchPhase('indexer');
      await yieldToPaint();

      const indexerRes = await serverApi.search({
        q: searchTerm,
        type: typeParam,
        source: 'indexer',
        lang: language,
        user_id: serverApi.getCurrentUserId() || undefined,
      });

      if (!indexerRes.success) {
        if (localData.length === 0) {
          setError(indexerRes.message || 'Erreur lors de la recherche sur les indexeurs');
        }
        setSearchLive((prev) => ({
          ...prev,
          indexerRunning: false,
          indexerError: true,
          indexerDone: false,
          indexerMovies: 0,
          indexerSeries: 0,
        }));
        finalizeSkipTmdb();
        setLoading(false);
        setSearchPhase('idle');
        return;
      }

      const indexerData = indexerRes.data ?? [];
      const idxCounts2 = countMoviesSeries(indexerData);
      const combinedData = [...localData, ...indexerData];

      setSearchLive((prev) => ({
        ...prev,
        indexerRunning: false,
        indexerDone: true,
        indexerError: false,
        indexerMovies: idxCounts2.movies,
        indexerSeries: idxCounts2.series,
      }));

      setResults(combinedData);
      CacheManager.set(cacheKey, combinedData, 60 * 60 * 1000);
      await yieldToPaint();

      if (combinedData.length === 0 && searchTerm) {
        setSearchPhase('tmdb');
        setSearchLive((prev) => ({ ...prev, tmdbRunning: true }));
        await yieldToPaint();

        const tmdbLang = language === 'fr' ? 'fr-FR' : 'en-US';
        const tmdbRes = await serverApi.searchTmdb({
          q: searchTerm,
          type: typeParam,
          language: tmdbLang,
          page: 1,
        });

        let mapped2: SearchResult[] = [];
        if (tmdbRes.success && tmdbRes.data && tmdbRes.data.length > 0) {
          mapped2 = tmdbRes.data.map((r: Record<string, unknown>) => ({
            id: String(r.id ?? `tmdb-${r.tmdbId}-${r.type}`),
            title: String(r.title ?? ''),
            type: ((r.type as string) === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
            poster: r.poster as string | undefined,
            year: r.year as number | undefined,
            overview: r.overview as string | undefined,
            tmdbId: Number(r.tmdbId ?? 0),
          }));
          setTmdbFallbackResults(mapped2);
        } else {
          setTmdbFallbackResults([]);
        }
        const tm2 = countMoviesSeries(mapped2);
        setSearchLive((prev) => ({
          ...prev,
          tmdbRunning: false,
          tmdbDone: true,
          tmdbSkipped: false,
          tmdbMovies: tm2.movies,
          tmdbSeries: tm2.series,
        }));
      } else {
        setTmdbFallbackResults([]);
        finalizeSkipTmdb();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
      setSearchPhase('idle');
    }
  }, [query, language, forceIndexerSearch, t]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTmdbFallbackResults([]);
    setSearchPhase('idle');
    setSearchLive(initialSearchLiveProgress());
    if (!isTVPlatform()) {
      inputRef.current?.focus();
    }
  };

  const filterTabs = [
    { id: 'all' as const, label: t('search.filterAll'), count: groupedResults.length },
    { id: 'movie' as const, label: t('search.filterMovies'), count: movies.length },
    { id: 'tv' as const, label: t('search.filterSeries'), count: series.length },
  ];
  const showResultCounts = Boolean(query && !loading && (allResults.length > 0 || tmdbFallbackResults.length > 0));

  const phaseTitle =
    searchPhase === 'local'
      ? isTV
        ? t('search.searchingLocalShort')
        : t('search.searchingLocal')
      : searchPhase === 'tmdb'
        ? isTV
          ? t('search.searchingTmdbShort')
          : t('search.searchingTmdb')
        : isTV
          ? t('search.searchingIndexersShort')
          : t('search.searchingIndexers');

  const showIdleHome = !query && !loading;
  const showResults = !loading && Boolean(query) && allResults.length > 0;
  const showTmdbFallback =
    !loading && Boolean(query) && allResults.length === 0 && !error && tmdbFallbackResults.length > 0;
  const showNoResults =
    !loading && Boolean(query) && allResults.length === 0 && !error && tmdbFallbackResults.length === 0;

  return (
    <div
      className={`search-page flex flex-col w-full min-w-0 overflow-x-hidden bg-[var(--ds-surface)] text-[var(--ds-text-primary)] ${
        showIdleHome || loading || showNoResults ? 'search-page--centered' : ''
      }`}
      data-page="search"
    >
      <div className="search-page__stage mx-auto w-full max-w-xl sm:max-w-2xl tv:max-w-3xl px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="w-full flex flex-col items-center gap-4 sm:gap-5 tv:gap-6">
          <div className="min-w-0 w-full">
            <h1 className="text-2xl sm:text-3xl tv:text-5xl font-bold text-[var(--ds-text-primary)] tracking-tight">
              {t('search.title')}
            </h1>
            {!isTV && showIdleHome && (
              <p className="mt-1.5 text-sm sm:text-base text-[var(--ds-text-tertiary)]">
                {t('search.subtitle')}
              </p>
            )}
            {isTV && query.trim() && (
              <p className="mt-2 text-base tv:text-2xl text-[var(--ds-text-secondary)] truncate px-2">
                {loading
                  ? t('search.searchingFor', { query: query.trim() })
                  : query.trim()}
              </p>
            )}
          </div>

          <form
            className="w-full"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
          >
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 tv:pl-6 pointer-events-none z-10">
                <SearchIcon className="w-4 h-4 tv:w-7 tv:h-7 text-[var(--ds-text-tertiary)]" size={18} />
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder={t('search.placeholder')}
                className={`w-full pl-10 tv:pl-16 py-2.5 tv:py-4 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-tertiary)] focus:outline-none focus:border-[var(--ds-accent-violet)] focus:ring-2 focus:ring-[var(--ds-accent-violet)]/20 text-sm tv:text-2xl min-h-[48px] tv:min-h-[64px] transition-colors text-left ${
                  isTV ? 'pr-10 tv:pr-14' : 'pr-[7.5rem] sm:pr-[9.5rem]'
                }`}
                value={query}
                readOnly={isTV}
                inputMode={isTV ? 'none' : undefined}
                onInput={(e) => {
                  if (isTV) return;
                  const el = e.target as HTMLInputElement;
                  setQuery(el?.value ?? '');
                }}
                onKeyDown={(e) => {
                  if (isTV) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                tabIndex={isTV ? -1 : 0}
                data-focusable={isTV ? undefined : true}
                data-tv-initial-focus={isTV ? undefined : true}
                autoComplete="off"
              />
              {!isTV && (
                <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">
                  {query ? (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-white/5 transition-colors focus:outline-none"
                      tabIndex={0}
                      data-focusable
                      aria-label={t('search.clearSearch')}
                    >
                      <X className="w-4 h-4" size={18} />
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full ds-btn-accent px-3.5 sm:px-4 h-9 sm:h-10 text-sm font-semibold disabled:opacity-40 shrink-0"
                    tabIndex={0}
                    data-focusable
                  >
                    {loading ? (
                      <DsLoader size="xs" />
                    ) : (
                      <SearchIcon className="w-4 h-4" size={16} />
                    )}
                    <span className="hidden sm:inline">{t('common.search')}</span>
                  </button>
                </div>
              )}
            </div>
          </form>

          {isTV && !loading && (
            <div className="w-full">
              <TvOnScreenKeyboard
                value={query}
                onChange={setQuery}
                onSearch={() => handleSearch()}
                disabled={loading}
              />
            </div>
          )}

          <div
            role="tablist"
            aria-label={t('search.filterAll')}
            data-tv-page-action
            className={`flex flex-wrap items-center justify-center gap-2 tv:gap-3 ${loading && isTV ? 'opacity-60' : ''}`}
          >
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={type === tab.id}
                data-focusable
                tabIndex={0}
                onClick={() => setType(tab.id)}
                className={`gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-1.5 tv:gap-2.5 rounded-full px-3.5 py-1.5 tv:px-6 tv:py-3 text-sm tv:text-xl font-medium border transition-colors min-h-[36px] tv:min-h-[56px] ${
                  type === tab.id
                    ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] border-transparent'
                    : 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-secondary)] border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]'
                }`}
              >
                {tab.label}
                {showResultCounts ? (
                  <span className="tabular-nums opacity-80">{tab.count}</span>
                ) : null}
              </button>
            ))}
          </div>

          {error && (
            <div className="w-full ds-box-error rounded-2xl px-4 py-3 text-sm text-[var(--ds-text-primary)] text-center">
              {error}
            </div>
          )}

          {showIdleHome && (
            searchHistory.length > 0 ? (
              <div className="w-full pt-2 tv:pt-4">
                <h3 className="text-sm tv:text-2xl font-semibold text-[var(--ds-text-secondary)] mb-3 tv:mb-5">
                  {t('search.recentSearches')}
                </h3>
                <div className="flex flex-wrap justify-center gap-2 tv:gap-4">
                  {searchHistory.map((term) => (
                    <button
                      key={term}
                      type="button"
                      data-focusable
                      onClick={() => handleSearch(term)}
                      className="gtv-pill-btn ds-focus-glow ds-active-glow px-3.5 py-1.5 tv:px-6 tv:py-3.5 rounded-full bg-[var(--ds-surface-elevated)] hover:border-[var(--ds-border-strong)] border border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] text-sm tv:text-xl min-h-[36px] tv:min-h-[56px] transition-colors"
                      tabIndex={0}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full pt-3 sm:pt-4 flex flex-col items-center gap-3 tv:gap-4">
                <div className="w-14 h-14 tv:w-20 tv:h-20 rounded-full flex items-center justify-center border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
                  <SearchIcon size={28} className="text-[var(--ds-text-tertiary)] w-7 h-7 tv:w-10 tv:h-10" />
                </div>
                <h2 className="text-lg sm:text-xl tv:text-3xl font-semibold text-[var(--ds-text-primary)]">
                  {t('search.startSearch')}
                </h2>
                <p className="text-[var(--ds-text-tertiary)] text-sm tv:text-xl max-w-md tv:max-w-2xl px-2">
                  {isTV ? t('search.startSearchDescriptionTv') : t('search.startSearchDescription')}
                </p>
              </div>
            )
          )}

          {showNoResults && (
            <div className="w-full pt-3 sm:pt-4 flex flex-col items-center gap-3 tv:gap-4">
              <div className="w-14 h-14 tv:w-20 tv:h-20 rounded-full flex items-center justify-center border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
                <SearchIcon size={28} className="text-[var(--ds-text-tertiary)] w-7 h-7 tv:w-10 tv:h-10" />
              </div>
              <h2 className="text-lg sm:text-xl tv:text-3xl font-semibold text-[var(--ds-text-primary)]">
                {t('search.noResults')}
              </h2>
              <p className="text-[var(--ds-text-tertiary)] text-sm tv:text-xl max-w-md tv:max-w-2xl px-2">
                {t('search.noResultsFor', {
                  type: type === 'all' ? t('search.content') : type === 'movie' ? t('common.film').toLowerCase() : t('common.serie').toLowerCase(),
                  query,
                })}
              </p>
              <button
                type="button"
                onClick={handleClear}
                className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2 rounded-full ds-btn-accent px-4 py-2.5 tv:px-8 tv:py-4 text-sm tv:text-xl font-semibold min-h-[44px] tv:min-h-[64px] mt-1"
                tabIndex={0}
                data-focusable
              >
                {t('search.newSearch')}
              </button>
            </div>
          )}

          {loading && (
            <div className="w-full mt-1 rounded-2xl tv:rounded-3xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] p-5 tv:p-8 text-left animate-fade-in-up">
              <div className="flex items-center gap-4 tv:gap-6">
                <span className="inline-flex h-12 w-12 tv:h-16 tv:w-16 items-center justify-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface)] shrink-0 text-[var(--ds-accent-violet)]">
                  <DsLoader size={isTV ? 'md' : 'sm'} className="text-[var(--ds-accent-violet)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    key={phaseTitle}
                    className="text-base tv:text-2xl font-semibold text-[var(--ds-text-primary)] leading-snug animate-fade-in"
                  >
                    {phaseTitle}
                  </h2>
                  <p className="text-sm tv:text-lg text-[var(--ds-text-tertiary)] mt-1">
                    {t('search.searchLiveSubtitle')}
                  </p>
                </div>
              </div>
              <SearchLiveProgressTimeline live={searchLive} t={t} />
            </div>
          )}
        </div>
      </div>

      {showResults && (
        <div className="pt-4 sm:pt-6 pb-12 w-full min-w-0 max-w-full overflow-x-hidden border-t border-white/10" data-search-results>
          <SearchResultsSection
            title={t('search.inLibrary')}
            results={libraryResults}
            onResultClick={onResultClick}
            initialFocus
          />
          <SearchResultsSection
            title={t('search.moviesFound')}
            results={catalogMovies}
            onResultClick={onResultClick}
            initialFocus={libraryResults.length === 0}
          />
          <SearchResultsSection
            title={t('search.seriesFound')}
            results={catalogSeries}
            onResultClick={onResultClick}
            initialFocus={libraryResults.length === 0 && catalogMovies.length === 0}
          />
        </div>
      )}

      {showTmdbFallback && (
        <div className="pt-4 sm:pt-6 pb-12 w-full min-w-0 max-w-full overflow-x-hidden border-t border-white/10" data-search-results>
          <p className="px-4 sm:px-8 lg:px-12 text-sm tv:text-base text-white/55 mb-4 text-center">
            {t('search.noTorrentsUseRequest')}
          </p>
          {type === 'all' ? (
            <>
              <SearchResultsSection
                title={t('search.tmdbMoviesRequest')}
                results={sortedTmdbFallback.filter((r) => r.type === 'movie')}
                onResultClick={onResultClick}
                initialFocus
              />
              <SearchResultsSection
                title={t('search.tmdbSeriesRequest')}
                results={sortedTmdbFallback.filter((r) => r.type === 'tv')}
                onResultClick={onResultClick}
                initialFocus={sortedTmdbFallback.every((r) => r.type !== 'movie')}
              />
            </>
          ) : (
            <SearchResultsSection
              title={t('search.tmdbRequestTitle')}
              results={sortedTmdbFallback}
              onResultClick={onResultClick}
              initialFocus
            />
          )}
          <div className="mt-6 px-4 sm:px-8 lg:px-12 flex justify-center">
            <button
              type="button"
              onClick={handleClear}
              className="gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center rounded-full ds-btn-secondary px-4 py-2 tv:px-8 tv:py-4 text-sm tv:text-xl font-semibold min-h-[44px] tv:min-h-[64px]"
              tabIndex={0}
              data-focusable
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}