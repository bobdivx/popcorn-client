import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { Search as SearchIcon, X, Layers2, CloudDownload, HardDrive, FolderOpen, Film, Loader2, CheckCircle2, MinusCircle } from 'lucide-preact';
import { serverApi, type SearchResult } from '../lib/client/server-api';
import { CacheManager } from '../lib/client/storage';
import { FocusableCard } from './ui/FocusableCard';
import { LoadingCard } from './ui/design-system';
import CarouselRow from './torrents/CarouselRow';
import { useI18n } from '../lib/i18n/useI18n';
import { isTVPlatform } from '../lib/utils/device-detection';

const SEARCH_HISTORY_KEY = 'popcorn_search_history';
const SEARCH_HISTORY_MAX = 10;
const SEARCH_CACHE_VERSION = 'v6';

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
        dim ? 'text-white/35' : active ? 'text-white/95 bg-white/5' : 'text-white/80'
      }`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {skipped ? (
          <MinusCircle className="w-4 h-4 text-white/35" strokeWidth={2} />
        ) : error ? (
          <MinusCircle className="w-4 h-4 text-amber-400/90" strokeWidth={2} />
        ) : done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
        ) : active ? (
          <Loader2 className="w-4 h-4 text-primary-400 animate-spin" strokeWidth={2.25} />
        ) : (
          <span className="inline-block w-4 h-4 rounded-full border border-white/25" />
        )}
      </span>
      <span className="leading-snug flex-1 min-w-0">
        <span className="font-semibold block">{label}</span>
        {detail ? <span className="text-xs text-white/50 block mt-0.5">{detail}</span> : null}
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
    <ul className="mt-6 space-y-1 text-sm max-w-md mx-auto" aria-live="polite" aria-label={t('search.progressAriaLabel')}>
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

/** URL de détail : priorité TMDB (tmdbId + type), fallback slug. Discover si pas de torrent (id tmdb-xxx). */
function getDetailUrl(result: SearchResult): string {
  // Si c'est un résultat TMDB pur (sans torrent), go Discover
  if (result.id?.startsWith('tmdb-') && result.tmdbId != null) {
    return `/discover?tmdbId=${result.tmdbId}&type=${result.type}`;
  }

  // Si c'est téléchargé (déjà en bibliothèque), on peut aller sur la page torrent (détail/stream)
  if (result.isDownloaded && result.tmdbId != null) {
    const typeParam = result.type === 'tv' ? 'tv' : 'movie';
    return `/torrents?tmdbId=${result.tmdbId}&type=${typeParam}&from=search${result.title ? `&title=${encodeURIComponent(result.title)}` : ''}`;
  }

  // Pour les autres cas (indexer, etc.), si on a un tmdbId, on préfère passer par Discover
  // pour permettre la demande ou voir les infos, car /torrents risque d'être vide.
  if (result.tmdbId != null) {
    return `/discover?tmdbId=${result.tmdbId}&type=${result.type}`;
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FocusableCard
        ariaLabel={result.title}
        className={`w-full block text-left rounded-2xl overflow-hidden border transition duration-200 ${
          cardActive
            ? 'border-primary-500/50 bg-primary-500/10'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
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
        <div className="relative aspect-video w-full overflow-hidden bg-black/30">
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
          <div className="text-base tv:text-lg font-semibold text-white truncate" title={result.title}>
            {result.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm tv:text-base text-white/60 mt-1">
            {result.year ? (
              <>
                <span>{result.year}</span>
                <span className="w-1 h-1 shrink-0 rounded-full bg-white/25" aria-hidden />
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
  const type = 'all';
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

  useEffect(() => {
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

  // Après validation de la recherche (OK / Enter) : déplacer le focus sur le premier résultat (TV / télécommande)
  useEffect(() => {
    const hadLoading = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (!isTVPlatform()) return;
    const hasResults = allResults.length > 0 || tmdbFallbackResults.length > 0;
    if (!hasResults || loading) return;
    const focusOnInput = document.activeElement === inputRef.current;
    const justFinishedLoading = hadLoading;
    if (!justFinishedLoading && !focusOnInput) return;
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

      const typeParam = type === 'all' ? undefined : type;

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
  }, [query, type, language, forceIndexerSearch, t]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTmdbFallbackResults([]);
    setSearchPhase('idle');
    setSearchLive(initialSearchLiveProgress());
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-black text-white w-full min-w-0 max-w-[100vw] overflow-x-hidden">
      {/* Section Hero avec barre de recherche moderne */}
      <div className="relative w-full min-h-[350px] tv:min-h-[450px] mb-8 overflow-hidden bg-black flex flex-col items-center justify-center px-4">
        {/* Cercles de lumière animés en arrière-plan */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-600/20 blur-[120px] rounded-full pointer-events-none animate-pulse-slow" />
        <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />
        
        {/* Texture de grain subtile */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />

        <div className="relative z-10 w-full max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-2xl">
              {t('search.title').toUpperCase()}
            </h1>
            <p className="text-white/40 text-sm md:text-base lg:text-lg max-w-2xl mx-auto font-medium">
              {t('search.subtitle') || 'Explorez votre bibliothèque et au-delà'}
            </p>
          </div>

            {/* Barre de recherche moderne */}
            <form
              className="flex flex-col sm:flex-row gap-3 tv:gap-4 mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
            >
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 tv:pl-6 pointer-events-none z-10">
                  <SearchIcon className="w-5 h-5 tv:w-7 tv:h-7 text-gray-400" size={24} />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={t('search.placeholder')}
                  className="w-full pl-12 tv:pl-16 pr-12 tv:pr-16 py-3 tv:py-4 bg-gray-900/90 backdrop-blur-sm border-2 border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 text-base tv:text-lg min-h-[56px] tv:min-h-[64px] transition-all duration-200"
                  value={query}
                  onInput={(e) => {
                    const el = e.target as HTMLInputElement;
                    setQuery(el?.value ?? '');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  tabIndex={0}
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 tv:pr-6 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-opacity-50 rounded"
                    tabIndex={0}
                    aria-label={t('search.clearSearch')}
                  >
                    <X className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-full sm:w-auto bg-primary hover:bg-primary-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[56px] tv:min-h-[64px]"
                tabIndex={0}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm tv:loading-md"></span>
                ) : (
                  <>
                    <SearchIcon className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span className="hidden sm:inline">{t('common.search')}</span>
                  </>
                )}
              </button>
            </form>



          </div>
        </div>
      {/* Affichage des résultats */}
      {error && (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16 mb-6">
          <div className="alert alert-error bg-primary-900/20 border border-primary-500 text-primary-300 glass-panel">
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Résultats organisés en carrousels */}
      {!loading && query && allResults.length > 0 && (
        <div className="pb-8 tv:pb-12 w-full min-w-0 max-w-full overflow-x-hidden" data-search-results>
          {type === 'all' ? (
            <>
              {movies.length > 0 && (
                <CarouselRow title={t('search.moviesFound')}>
                  {movies.map((result) => (
                    <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                      <SearchResultPoster 
                        result={result} 
                        onClick={onResultClick}
                      />
                    </div>
                  ))}
                </CarouselRow>
              )}
              {series.length > 0 && (
                <CarouselRow title={t('search.seriesFound')}>
                  {series.map((result) => (
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
            <CarouselRow title={type === 'movie' ? t('search.moviesFound') : t('search.seriesFound')}>
              {allResults.map((result) => (
                <div key={result.id} className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]">
                  <SearchResultPoster 
                    result={result} 
                    onClick={onResultClick}
                  />
                </div>
              ))}
            </CarouselRow>
          )}
        </div>
      )}

      {/* État de chargement : carte C411 avec LoadingCard */}
      {loading && (
        <div className="flex flex-col items-center justify-start py-6 tv:py-8 px-4 w-full max-w-[42rem] mx-auto -mt-2 sm:-mt-4">
          <LoadingCard
            title={
              searchPhase === 'local'
                ? t('search.searchingLocal')
                : searchPhase === 'tmdb'
                  ? t('search.searchingTmdb')
                  : t('search.searchingIndexers')
            }
            description={t('search.searchLiveSubtitle')}
            showProgressBar={true}
          >
            <SearchLiveProgressTimeline live={searchLive} t={t} />
          </LoadingCard>
        </div>
      )}

      {/* Aucun torrent trouvé mais résultats TMDB : proposer "Demander" */}
      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length > 0 && (
        <div className="pb-8 tv:pb-12 container mx-auto px-4 sm:px-6 lg:px-8 tv:px-16 w-full min-w-0 max-w-full overflow-x-hidden" data-search-results>
          <p className="text-gray-400 text-base tv:text-lg mb-4">
            {t('search.noTorrentsUseRequest')}
          </p>
          {type === 'all' ? (
            <>
              {sortedTmdbFallback.filter((r) => r.type === 'movie').length > 0 && (
                <CarouselRow title={t('search.tmdbMoviesRequest')}>
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
                <CarouselRow title={t('search.tmdbSeriesRequest')}>
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
            <CarouselRow title={t('search.tmdbRequestTitle')}>
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
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleClear}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm"
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}

      {/* État vide - aucun résultat (ni torrent ni TMDB) */}
      {!loading && query && allResults.length === 0 && !error && tmdbFallbackResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 tv:py-32 px-4">
          <div className="text-center max-w-2xl tv:max-w-3xl">
            <div className="text-6xl tv:text-8xl mb-4 tv:mb-6">🔍</div>
            <h2 className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6">
              {t('search.noResults')}
            </h2>
            <p className="text-gray-400 text-base tv:text-lg mb-6 tv:mb-8">
              {t('search.noResultsFor', { 
                type: type === 'all' ? t('search.content') : type === 'movie' ? t('common.film').toLowerCase() : t('common.serie').toLowerCase(),
                query 
              })}
            </p>
            <button
              type="button"
              onClick={handleClear}
              className="bg-primary hover:bg-primary-700 text-white px-8 tv:px-12 py-3 tv:py-4 rounded-lg font-semibold text-base tv:text-lg transition-all duration-300 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] tv:min-h-[56px]"
              tabIndex={0}
            >
              {t('search.newSearch')}
            </button>
          </div>
        </div>
      )}

      {/* Historique de recherche cliquable (état initial, pas de query) */}
      {!query && !loading && searchHistory.length > 0 && (
        <div className="px-4 sm:px-8 py-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {t('search.recentSearches')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((term) => (
              <button
                key={term}
                type="button"
                data-focusable
                onClick={() => handleSearch(term)}
                className="px-4 py-2 rounded-full bg-gray-800/90 hover:bg-gray-700 border border-gray-600 hover:border-primary-500 text-gray-200 hover:text-white text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                tabIndex={0}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}