import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { Search as SearchIcon, X, Layers2, CloudDownload, HardDrive, FolderOpen, Film, Loader2, CheckCircle2, MinusCircle } from 'lucide-preact';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';
import { FocusableCard } from './ui/FocusableCard';
import CarouselRow from './torrents/CarouselRow';
import { useI18n } from '../lib/i18n/useI18n';
import { isTVPlatform } from '../lib/utils/device-detection';
import { tvBrowseItemKey } from '../lib/tv-browse-restore';
import { TvOnScreenKeyboard } from './tv/TvOnScreenKeyboard';

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

/** Timeligne sous la carte de chargement : étapes locales → indexeurs → TMDB avec comptages réels après chaque requête */
function SearchLiveProgressTimeline({
  live,
  t,
}: {
  live: SearchLiveProgressState;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const formatCounts = (movies: number, series: number) =>
    t('search.progressCounts', { movies: String(movies), series: String(series) });

  const Row = ({
    label,
    done,
    active,
    error,
    skipped,
    detail,
    dim,
  }: {
    label: string;
    done: boolean;
    active: boolean;
    error?: boolean;
    skipped?: boolean;
    detail?: string;
    dim?: boolean;
  }) => (
    <li
      className={`flex items-start gap-2.5 text-left rounded-lg px-2 py-1.5 -mx-2 ${
        dim
          ? 'text-[var(--ds-text-tertiary)] opacity-60'
          : active
            ? 'text-[var(--ds-text-primary)] bg-[var(--ds-surface)]'
            : 'text-[var(--ds-text-secondary)]'
      }`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {skipped ? (
          <MinusCircle className="w-4 h-4 text-[var(--ds-text-tertiary)]" strokeWidth={2} />
        ) : error ? (
          <MinusCircle className="w-4 h-4 text-amber-500" strokeWidth={2} />
        ) : done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2.25} />
        ) : active ? (
          <Loader2 className="w-4 h-4 text-[var(--ds-accent-violet)] animate-spin" strokeWidth={2.25} />
        ) : (
          <span className="inline-block w-4 h-4 rounded-full border border-[var(--ds-border-strong)]" />
        )}
      </span>
      <span className="leading-snug flex-1 min-w-0">
        <span className="font-semibold block text-[var(--ds-text-primary)]">{label}</span>
        {detail ? <span className="text-xs text-[var(--ds-text-tertiary)] block mt-0.5">{detail}</span> : null}
      </span>
    </li>
  );

  const localActive = !live.localSkipped && !live.localDone;
  const localDetail =
    live.localSkipped
      ? t('search.progressLocalSkippedDetail')
      : live.localDone
        ? formatCounts(live.localMovies, live.localSeries)
        : undefined;

  const indexerDetail = live.indexerError
    ? t('search.progressIndexerErrorDetail')
    : live.indexerDone
      ? formatCounts(live.indexerMovies, live.indexerSeries)
      : undefined;

  const tmdbDetail = live.tmdbSkipped
    ? live.indexerError
      ? t('search.progressTmdbSkippedIndexerFail')
      : t('search.progressTmdbSkippedDetail')
    : live.tmdbDone && !live.tmdbSkipped
      ? live.tmdbMovies + live.tmdbSeries > 0
        ? formatCounts(live.tmdbMovies, live.tmdbSeries)
        : t('search.progressTmdbNoneDetail')
      : undefined;

  const indexerFinished = live.indexerDone || live.indexerError;
  const tmdbWaitingBeforeIndexerFinishes = !indexerFinished;

  return (
    <ul className="mt-2 space-y-1 text-sm" aria-live="polite" aria-label={t('search.progressAriaLabel')}>
      <Row
        label={
          live.localSkipped
            ? t('search.progressLocalSkipped')
            : t('search.progressStepLocal')
        }
        active={Boolean(localActive)}
        done={live.localDone || live.localSkipped}
        skipped={live.localSkipped}
        detail={localDetail}
      />
      <Row
        label={t('search.progressStepIndexer')}
        active={live.indexerRunning && !live.indexerDone && !live.indexerError}
        done={live.indexerDone}
        error={live.indexerError}
        detail={indexerDetail}
      />
      <Row
        label={t('search.progressStepTmdb')}
        active={live.tmdbRunning}
        done={live.tmdbDone && !live.tmdbSkipped}
        skipped={live.tmdbSkipped}
        detail={tmdbDetail}
        dim={tmdbWaitingBeforeIndexerFinishes}
      />
    </ul>
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
        className="inline-block max-w-[10rem] sm:max-w-[11rem] px-2.5 py-1 rounded-full text-[10px] lg:text-[11px] tv:text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90 truncate shadow-md"
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
        className="inline-block max-w-[9rem] px-2.5 py-1 rounded-full text-[10px] lg:text-[11px] tv:text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90 truncate shadow-md"
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
        className="inline-block max-w-[10rem] px-2.5 py-1 rounded-full text-[10px] lg:text-[11px] tv:text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90 truncate shadow-md"
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
        className="inline-block max-w-[10rem] px-2.5 py-1 rounded-full text-[10px] lg:text-[11px] tv:text-xs font-bold tracking-wide bg-black/50 border border-white/15 text-white/90 truncate shadow-md"
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
      className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 flex flex-wrap gap-1.5 justify-end items-center"
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
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${capsule(p.kind)}`}
        >
          <p.Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" strokeWidth={2.5} aria-hidden />
          <span className="text-[10px] sm:text-xs font-bold tabular-nums leading-none text-white">{p.n}</span>
        </span>
      ))}
      {showDownloadedBadge ? (
        <span
          className="inline-flex items-center justify-center p-1.5 lg:p-2 rounded-full bg-blue-500/80 border border-blue-400/50 shadow-lg shrink-0 animate-fade-in"
          title={t('search.downloaded') || 'En bibliothèque'}
          aria-label={t('search.downloaded') || 'En bibliothèque'}
        >
          <HardDrive className="w-4 h-4 lg:w-[18px] lg:h-[18px] text-white" strokeWidth={2.5} />
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

/**
 * Composant pour afficher un résultat de recherche dans un style moderne
 */
function SearchResultPoster({ result, onClick }: SearchResultPosterProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(result.poster || null);
  const detailUrl = getDetailUrl(result);
  const showOverlay = isHovered || isFocused;

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

  const cardActive = isHovered || isFocused;

  return (
    <div
      className="relative group torrent-poster min-w-[140px] sm:min-w-[160px] md:min-w-[180px] lg:min-w-[280px] xl:min-w-[320px] tv:min-w-[400px] cursor-pointer"
      data-tv-item-key={tvBrowseItemKey(result)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        ariaLabel={result.title}
        className={`w-full block text-left rounded-2xl overflow-hidden border transition duration-200 ${
          cardActive
            ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-surface-elevated)]'
            : 'border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] hover:border-[var(--ds-border-strong)]'
        }`}
        onClick={handleClick}
        href={onClick ? undefined : detailUrl}
        tabIndex={0}
        onFocus={(e) => {
          setIsFocused(true);
          setIsHovered(true);
          (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'center' });
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsHovered(false);
        }}
      >
        {/* Même principe que DownloadCard / EpisodeCardsCarousel : vignette 16:9 + bloc texte */}
        <div className="relative aspect-video w-full overflow-hidden bg-[#111]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover z-0"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-gradient-to-br from-white/10 via-black/40 to-black/80">
              <Film className="w-10 h-10 tv:w-12 tv:h-12 text-white/25 shrink-0" strokeWidth={1.75} aria-hidden />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent z-10 pointer-events-none" />

          <div className="absolute left-3 top-3 z-20 flex flex-col gap-2 items-start">
            <SearchIndexerBadge result={result} t={t} />
          </div>

          <SearchResultAvailability result={result} t={t} showDownloadedBadge={result.isDownloaded === true} />

          {/* Survol : résumé uniquement (titre lisible sous la vignette comme épisodes / téléchargements) */}
          {showOverlay && result.overview && (
            <div className="absolute inset-0 z-[18] bg-gradient-to-b from-black/20 via-black/55 to-black/90 flex flex-col justify-end p-3 lg:p-4 tv:p-5 pointer-events-none transition-opacity">
              <p className="text-xs lg:text-sm tv:text-base text-white/90 line-clamp-3 leading-snug">{result.overview}</p>
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4 tv:p-5 text-left">
          <div className="text-base tv:text-lg font-semibold text-[var(--ds-text-primary)] truncate" title={result.title}>
            {result.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm tv:text-base text-[var(--ds-text-tertiary)] mt-1">
            {result.year ? (
              <>
                <span>{result.year}</span>
                <span className="w-1 h-1 shrink-0 rounded-full bg-[var(--ds-border-strong)]" aria-hidden />
              </>
            ) : null}
            <span className="capitalize">{result.type === 'movie' ? t('common.film') : t('common.serie')}</span>
          </div>
        </div>
      </FocusableCard>
    </div>
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

  return (
    <div className="flex flex-col min-h-screen w-full min-w-0 max-w-[100vw] overflow-x-hidden bg-[var(--ds-surface)] text-[var(--ds-text-primary)]" data-page="search">
      <header className="px-4 sm:px-8 lg:px-12 pt-4 sm:pt-6 pb-3 border-b border-[var(--ds-border)]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
          <div className="min-w-0 lg:mr-auto">
            <h1 className="text-xl sm:text-2xl tv:text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight">
              {t('search.title')}
            </h1>
            {!isTV && (
              <p className="text-sm text-[var(--ds-text-tertiary)]">
                {t('search.subtitle')}
              </p>
            )}
          </div>

          <form
            className="flex w-full lg:max-w-2xl xl:max-w-3xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
          >
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 tv:pl-5 pointer-events-none z-10">
                <SearchIcon className="w-4 h-4 tv:w-6 tv:h-6 text-[var(--ds-text-tertiary)]" size={18} />
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder={t('search.placeholder')}
                className="w-full pl-10 tv:pl-14 pr-10 tv:pr-14 py-2.5 tv:py-3.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-tertiary)] focus:outline-none focus:border-[var(--ds-accent-violet)] focus:ring-2 focus:ring-[var(--ds-accent-violet)]/20 text-sm tv:text-lg min-h-[44px] tv:min-h-[56px] transition-colors"
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
              {query && !isTV && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 tv:pr-5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] transition-colors focus:outline-none rounded-full"
                  tabIndex={0}
                  data-focusable
                  aria-label={t('search.clearSearch')}
                >
                  <X className="w-4 h-4 tv:w-5 tv:h-5" size={18} />
                </button>
              )}
            </div>
            {!isTV && (
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-full ds-btn-accent px-4 tv:px-6 py-2 tv:py-3 text-sm tv:text-base font-semibold disabled:opacity-40 min-h-[44px] tv:min-h-[56px] shrink-0"
                tabIndex={0}
                data-focusable
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" size={16} />
                ) : (
                  <SearchIcon className="w-4 h-4 tv:w-5 tv:h-5" size={16} />
                )}
                <span className="hidden sm:inline">{t('common.search')}</span>
              </button>
            )}
          </form>
        </div>

        {isTV && (
          <div className="mt-4">
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
          className="mt-3 flex flex-wrap gap-2"
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 tv:px-5 tv:py-2.5 text-sm tv:text-base font-medium border transition-colors min-h-[36px] tv:min-h-[48px] ${
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
      </header>

      {error && (
        <div className="px-4 sm:px-8 lg:px-12 pt-4">
          <div className="ds-box-error rounded-2xl px-4 py-3 text-sm text-[var(--ds-text-primary)]">
            {error}
          </div>
        </div>
      )}

      {!loading && query && allResults.length > 0 && (
        <div className="pt-4 sm:pt-6 pb-12 w-full min-w-0 max-w-full overflow-x-hidden" data-search-results>
          {libraryResults.length > 0 && (
            <CarouselRow title={t('search.inLibrary')} autoScroll={false}>
              {libraryResults.map((result) => (
                <div key={`lib-${result.id}`} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
          {catalogMovies.length > 0 && (
            <CarouselRow title={t('search.moviesFound')} autoScroll={false}>
              {catalogMovies.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
          {catalogSeries.length > 0 && (
            <CarouselRow title={t('search.seriesFound')} autoScroll={false}>
              {catalogSeries.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster result={result} onClick={onResultClick} />
                </div>
              ))}
            </CarouselRow>
          )}
        </div>
      )}

      {loading && (
        <div className="px-4 sm:px-8 lg:px-12 py-8">
          <div className="max-w-xl mx-auto rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] p-5 tv:p-6">
            <div className="flex items-start gap-3 mb-2">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface)] shrink-0">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--ds-accent-violet)]" size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base tv:text-lg font-semibold text-[var(--ds-text-primary)]">
                  {searchPhase === 'local'
                    ? t('search.searchingLocal')
                    : searchPhase === 'tmdb'
                      ? t('search.searchingTmdb')
                      : t('search.searchingIndexers')}
                </h2>
                <p className="text-sm text-[var(--ds-text-tertiary)] mt-0.5">
                  {t('search.searchLiveSubtitle')}
                </p>
              </div>
            </div>
            <SearchLiveProgressTimeline live={searchLive} t={t} />
          </div>
        </div>
      )}

      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length > 0 && (
        <div className="pt-4 sm:pt-6 pb-12 w-full min-w-0 max-w-full overflow-x-hidden" data-search-results>
          <p className="px-4 sm:px-8 lg:px-12 text-sm tv:text-base text-[var(--ds-text-tertiary)] mb-4">
            {t('search.noTorrentsUseRequest')}
          </p>
          {type === 'all' ? (
            <>
              {sortedTmdbFallback.filter((r) => r.type === 'movie').length > 0 && (
                <CarouselRow title={t('search.tmdbMoviesRequest')} autoScroll={false}>
                  {sortedTmdbFallback
                    .filter((r) => r.type === 'movie')
                    .map((result) => (
                      <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                        <SearchResultPoster
                          result={result}
                          onClick={onResultClick}
                        />
                      </div>
                    ))}
                </CarouselRow>
              )}
              {sortedTmdbFallback.filter((r) => r.type === 'tv').length > 0 && (
                <CarouselRow title={t('search.tmdbSeriesRequest')} autoScroll={false}>
                  {sortedTmdbFallback
                    .filter((r) => r.type === 'tv')
                    .map((result) => (
                      <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                        <SearchResultPoster
                          result={result}
                          onClick={onResultClick}
                        />
                      </div>
                    ))}
                </CarouselRow>
              )}
            </>
          ) : (
            <CarouselRow title={t('search.tmdbRequestTitle')} autoScroll={false}>
              {sortedTmdbFallback.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster
                    result={result}
                    onClick={onResultClick}
                  />
                </div>
              ))}
            </CarouselRow>
          )}
          <div className="mt-6 px-4 sm:px-8 lg:px-12">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center rounded-full ds-btn-secondary px-4 py-2 tv:px-6 tv:py-3 text-sm tv:text-base font-semibold min-h-[44px] tv:min-h-[52px]"
              tabIndex={0}
              data-focusable
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}

      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length === 0 && (
        <div className="px-4 sm:px-8 lg:px-12 py-10 tv:py-16">
          <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border border-[var(--ds-border)] bg-[var(--ds-surface)]">
              <SearchIcon size={28} className="text-[var(--ds-text-tertiary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--ds-text-primary)] mb-1">
              {t('search.noResults')}
            </h2>
            <p className="text-[var(--ds-text-tertiary)] text-sm max-w-md mb-5">
              {t('search.noResultsFor', {
                type: type === 'all' ? t('search.content') : type === 'movie' ? t('common.film').toLowerCase() : t('common.serie').toLowerCase(),
                query,
              })}
            </p>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-2 rounded-full ds-btn-accent px-4 py-2.5 text-sm font-semibold min-h-[44px]"
              tabIndex={0}
              data-focusable
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}

      {!query && !loading && (
        <div className="px-4 sm:px-8 lg:px-12 py-8 tv:py-10">
          {searchHistory.length > 0 ? (
            <>
              <h3 className="text-sm tv:text-base font-semibold text-[var(--ds-text-secondary)] mb-3 tv:mb-4">
                {t('search.recentSearches')}
              </h3>
              <div className="flex flex-wrap gap-2 tv:gap-3">
                {searchHistory.map((term) => (
                  <button
                    key={term}
                    type="button"
                    data-focusable
                    onClick={() => handleSearch(term)}
                    className="px-3.5 py-1.5 tv:px-5 tv:py-2.5 rounded-full bg-[var(--ds-surface-elevated)] hover:border-[var(--ds-border-strong)] border border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] text-sm tv:text-base min-h-[36px] tv:min-h-[48px] transition-colors"
                    tabIndex={0}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                <SearchIcon size={28} className="text-[var(--ds-text-tertiary)]" />
              </div>
              <h2 className="text-xl font-bold text-[var(--ds-text-primary)] mb-1">
                {t('search.startSearch')}
              </h2>
              <p className="text-[var(--ds-text-tertiary)] text-sm max-w-md">
                {t('search.startSearchDescription')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}