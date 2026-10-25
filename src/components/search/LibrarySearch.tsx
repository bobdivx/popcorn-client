/**
 * Recherche dans la bibliothèque du serveur (films, séries, épisodes), sans indexers.
 *
 * Page Recherche d'un serveur sans module Indexers (mode « media center »), et onglet
 * « Ma bibliothèque » quand les indexers sont là. Filtrage côté client de GET /library
 * (voir `lib/library-search.ts`) : résultats au fil de la frappe, clavier virtuel sur TV.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Search as SearchIcon, X, Film, Tv2, HardDrive } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { TvOnScreenKeyboard } from '../tv/TvOnScreenKeyboard';
import { FocusableCard } from '../ui/FocusableCard';
import { DsLoader } from '../ui/DsLoader';
import type { LibraryMedia } from '../Library';
import { libraryMediaToContentItem } from '../dashboard/hooks/useLibraryBrowse';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';
import { searchLibrary, librarySourceType, type LibrarySearchHit } from '../../lib/library-search';

type TypeFilter = 'all' | 'movie' | 'tv';

const RESULT_LIMIT = 120;
const MAX_EPISODES_SHOWN = 3;

const TEXT = {
  fr: {
    subtitle: 'Films, séries et épisodes de votre bibliothèque.',
    placeholder: 'Rechercher dans ma bibliothèque…',
    idleTitle: 'Rechercher dans votre bibliothèque',
    idleBody: (n: number) =>
      n > 0
        ? `${n} titre${n > 1 ? 's' : ''} sur votre serveur. Tapez un titre, un mot ou un épisode (ex. « S01E02 »).`
        : 'Tapez un titre, un mot ou un épisode (ex. « S01E02 »).',
    idleBodyTv: 'Saisissez un titre avec le clavier ci-dessous.',
    emptyTitle: 'Votre bibliothèque est vide',
    emptyBody: 'Les vidéos présentes sur votre serveur Popcornn apparaîtront ici et pourront être recherchées.',
    noResultsTitle: 'Aucun résultat dans votre bibliothèque',
    noResultsBody: (q: string) => `Rien ne correspond à « ${q} ». Vérifiez l’orthographe ou essayez un autre mot.`,
    errorTitle: 'Bibliothèque indisponible',
    errorBody: 'Impossible de charger la bibliothèque du serveur. Réessayez dans un instant.',
    retry: 'Réessayer',
    results: (n: number) => `${n} résultat${n > 1 ? 's' : ''} dans votre bibliothèque`,
    episode: 'Épisode',
    moreEpisodes: (n: number) => `+ ${n} autre${n > 1 ? 's' : ''}`,
    film: 'Film',
    serie: 'Série',
  },
  en: {
    subtitle: 'Movies, shows and episodes in your library.',
    placeholder: 'Search my library…',
    idleTitle: 'Search your library',
    idleBody: (n: number) =>
      n > 0
        ? `${n} title${n > 1 ? 's' : ''} on your server. Type a title, a word or an episode (e.g. “S01E02”).`
        : 'Type a title, a word or an episode (e.g. “S01E02”).',
    idleBodyTv: 'Enter a title with the keyboard below.',
    emptyTitle: 'Your library is empty',
    emptyBody: 'Videos stored on your Popcornn server will appear here and can be searched.',
    noResultsTitle: 'No results in your library',
    noResultsBody: (q: string) => `Nothing matches “${q}”. Check the spelling or try another word.`,
    errorTitle: 'Library unavailable',
    errorBody: 'Could not load the server library. Try again in a moment.',
    retry: 'Retry',
    results: (n: number) => `${n} result${n > 1 ? 's' : ''} in your library`,
    episode: 'Episode',
    moreEpisodes: (n: number) => `+ ${n} more`,
    film: 'Movie',
    serie: 'Show',
  },
};

type Tx = (typeof TEXT)['fr'];

function detailUrl(hit: LibrarySearchHit<LibraryMedia>): string {
  return buildStrictTmdbDetailUrlFromContentItem(libraryMediaToContentItem(hit.item), 'search');
}

function ResultCard({ hit, tx, initialFocus }: { hit: LibrarySearchHit<LibraryMedia>; tx: Tx; initialFocus: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const image = hit.item.hero_image_url || hit.item.poster_url || null;
  const shown = hit.episodes.slice(0, MAX_EPISODES_SHOWN);
  const more = hit.episodes.length - shown.length;
  return (
    <div data-tv-list-item data-tv-initial-focus={initialFocus ? true : undefined} className="min-w-0">
      <FocusableCard
        ariaLabel={hit.title}
        href={detailUrl(hit)}
        className="group text-left rounded-2xl tv:rounded-3xl overflow-hidden border border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07] focus:border-[var(--ds-accent-violet)] transition-colors duration-200 focus:outline-none w-full h-full block"
        onFocus={(e) => (e.currentTarget as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' })}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
          {image && !imgFailed ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/10 via-black/50 to-black/90 text-white/25">
              {hit.type === 'tv' ? <Tv2 className="w-10 h-10 tv:w-14 tv:h-14" /> : <Film className="w-10 h-10 tv:w-14 tv:h-14" />}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <span className="absolute left-3 top-3 tv:left-4 tv:top-4 px-2.5 py-1 tv:px-3.5 tv:py-1.5 rounded-full text-[10px] tv:text-sm font-semibold bg-black/50 border border-white/12 text-white/85 backdrop-blur-md inline-flex items-center gap-1">
            <HardDrive className="w-3 h-3 tv:w-4 tv:h-4" />
            {hit.type === 'tv' ? tx.serie : tx.film}
          </span>
        </div>
        <div className="p-3 sm:p-4 tv:p-5 text-left">
          <div className="text-sm sm:text-base tv:text-xl font-semibold text-white/95 line-clamp-2 leading-snug" title={hit.title}>
            {hit.title}
          </div>
          {hit.year ? <div className="text-[11px] sm:text-xs tv:text-sm text-white/55 mt-1 tabular-nums">{hit.year}</div> : null}
          {shown.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-[11px] sm:text-xs tv:text-sm text-white/70">
              {shown.map((ep) => (
                <li key={ep.label} className="truncate" title={ep.label}>
                  <span className="font-semibold text-white/85">{ep.code ?? tx.episode}</span>
                  <span className="text-white/45"> · {ep.label}</span>
                </li>
              ))}
              {more > 0 ? <li className="text-white/45">{tx.moreEpisodes(more)}</li> : null}
            </ul>
          ) : null}
        </div>
      </FocusableCard>
    </div>
  );
}

function StateBlock({ title, body, children }: { title: string; body: string; children?: preact.ComponentChildren }) {
  return (
    <div className="w-full pt-3 sm:pt-4 flex flex-col items-center gap-3 tv:gap-4" role="status">
      <div className="w-14 h-14 tv:w-20 tv:h-20 rounded-full flex items-center justify-center border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
        <SearchIcon size={28} className="text-[var(--ds-text-tertiary)] w-7 h-7 tv:w-10 tv:h-10" />
      </div>
      <h2 className="text-lg sm:text-xl tv:text-3xl font-semibold text-[var(--ds-text-primary)]">{title}</h2>
      <p className="text-[var(--ds-text-tertiary)] text-sm tv:text-xl max-w-md tv:max-w-2xl px-2">{body}</p>
      {children}
    </div>
  );
}

const ACTION_BTN =
  'gtv-pill-btn ds-focus-glow ds-active-glow inline-flex items-center gap-2 rounded-full ds-btn-accent px-4 py-2.5 tv:px-8 tv:py-4 text-sm tv:text-xl font-semibold min-h-[44px] tv:min-h-[64px] mt-1';

export default function LibrarySearch() {
  const { t, language } = useI18n();
  const tx: Tx = language === 'en' ? TEXT.en : TEXT.fr;
  const isTV = isTVPlatform();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('q') || '').trim();
  });
  const [debounced, setDebounced] = useState(query);
  const [type, setType] = useState<TypeFilter>('all');
  const [items, setItems] = useState<LibraryMedia[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    serverApi
      .getLibrary()
      .then((res) => {
        if (cancelled) return;
        if (res.success && Array.isArray(res.data)) setItems(res.data as unknown as LibraryMedia[]);
        else {
          setItems([]);
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (isTV) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

  // Résultats au fil de la frappe (léger délai pour les grosses bibliothèques).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(id);
  }, [query]);

  const available = useMemo(() => (items ?? []).filter((m) => m && m.exists !== false), [items]);
  const titleCount = useMemo(() => {
    const keys = new Set<string>();
    for (const m of available) {
      const kind = librarySourceType(m);
      keys.add(m.tmdb_id ? `${kind}:${m.tmdb_id}` : `${kind}:${m.name}`);
    }
    return keys.size;
  }, [available]);

  const allHits = useMemo(() => searchLibrary(available, debounced, { limit: RESULT_LIMIT }), [available, debounced]);
  const hits = useMemo(() => (type === 'all' ? allHits : allHits.filter((h) => h.type === type)), [allHits, type]);
  const counts = useMemo(
    () => ({
      all: allHits.length,
      movie: allHits.filter((h) => h.type === 'movie').length,
      tv: allHits.filter((h) => h.type === 'tv').length,
    }),
    [allHits],
  );

  const loading = items === null;
  const q = debounced.trim();
  const ready = !loading && !failed;
  const libraryEmpty = ready && available.length === 0;
  const showIdle = ready && !libraryEmpty && !q;
  const showNoResults = ready && !libraryEmpty && Boolean(q) && hits.length === 0;
  const showResults = ready && Boolean(q) && hits.length > 0;

  const focusFirstResult = () => {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      document
        .querySelector<HTMLElement>('[data-search-results] a[href], [data-search-results] [data-focusable]')
        ?.focus();
    }, 200);
  };

  const clear = () => {
    setQuery('');
    setDebounced('');
    if (!isTV) inputRef.current?.focus();
  };

  const filterTabs: Array<{ id: TypeFilter; label: string; count: number }> = [
    { id: 'all', label: t('search.filterAll'), count: counts.all },
    { id: 'movie', label: t('search.filterMovies'), count: counts.movie },
    { id: 'tv', label: t('search.filterSeries'), count: counts.tv },
  ];

  return (
    <div
      className={`search-page flex flex-col w-full min-w-0 overflow-x-hidden bg-[var(--ds-surface)] text-[var(--ds-text-primary)] ${
        showResults ? '' : 'search-page--centered'
      }`}
      data-page="search"
      data-search-scope="library"
    >
      <div className="search-page__stage mx-auto w-full max-w-xl sm:max-w-2xl tv:max-w-3xl px-4 sm:px-6 flex flex-col items-center text-center">
        <div className="w-full flex flex-col items-center gap-4 sm:gap-5 tv:gap-6">
          <div className="min-w-0 w-full">
            <h1 className="text-2xl sm:text-3xl tv:text-5xl font-bold text-[var(--ds-text-primary)] tracking-tight">{t('search.title')}</h1>
            {!isTV && !q ? <p className="mt-1.5 text-sm sm:text-base text-[var(--ds-text-tertiary)]">{tx.subtitle}</p> : null}
            {isTV && query.trim() ? (
              <p className="mt-2 text-base tv:text-2xl text-[var(--ds-text-secondary)] truncate px-2">{query.trim()}</p>
            ) : null}
          </div>

          <form
            className="w-full"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setDebounced(query);
              focusFirstResult();
            }}
          >
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 tv:pl-6 pointer-events-none z-10">
                <SearchIcon className="w-4 h-4 tv:w-7 tv:h-7 text-[var(--ds-text-tertiary)]" size={18} />
              </div>
              <input
                ref={inputRef}
                type="text"
                enterKeyHint="search"
                placeholder={tx.placeholder}
                aria-label={tx.placeholder}
                className={`w-full pl-10 tv:pl-16 py-2.5 tv:py-4 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-tertiary)] focus:outline-none focus:border-[var(--ds-accent-violet)] focus:ring-2 focus:ring-[var(--ds-accent-violet)]/20 text-sm tv:text-2xl min-h-[48px] tv:min-h-[64px] transition-colors text-left ${
                  isTV ? 'pr-4' : 'pr-12'
                }`}
                value={query}
                readOnly={isTV}
                inputMode={isTV ? 'none' : undefined}
                onInput={(e) => {
                  if (isTV) return;
                  setQuery((e.target as HTMLInputElement)?.value ?? '');
                }}
                onKeyDown={(e) => {
                  if (isTV) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === 'Escape' && query) {
                    e.preventDefault();
                    clear();
                  }
                }}
                tabIndex={isTV ? -1 : 0}
                data-focusable={isTV ? undefined : true}
                data-tv-initial-focus={isTV ? undefined : true}
                autoComplete="off"
              />
              {!isTV && query ? (
                <div className="absolute inset-y-0 right-1.5 flex items-center">
                  <button
                    type="button"
                    onClick={clear}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-white/5 transition-colors focus:outline-none"
                    tabIndex={0}
                    data-focusable
                    aria-label={t('search.clearSearch')}
                  >
                    <X className="w-4 h-4" size={18} />
                  </button>
                </div>
              ) : null}
            </div>
          </form>

          {isTV && ready && !libraryEmpty ? (
            <div className="w-full">
              <TvOnScreenKeyboard value={query} onChange={setQuery} onSearch={focusFirstResult} />
            </div>
          ) : null}

          {ready && !libraryEmpty ? (
            <div role="tablist" aria-label={t('search.filterAll')} data-tv-page-action className="flex flex-wrap items-center justify-center gap-2 tv:gap-3">
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
                  {q ? <span className="tabular-nums opacity-80">{tab.count}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div className="pt-4" role="status">
              <DsLoader size={isTV ? 'md' : 'sm'} className="text-[var(--ds-accent-violet)]" />
            </div>
          ) : null}

          {failed ? (
            <StateBlock title={tx.errorTitle} body={tx.errorBody}>
              <button
                type="button"
                onClick={() => {
                  setItems(null);
                  setReload((n) => n + 1);
                }}
                className={ACTION_BTN}
                tabIndex={0}
                data-focusable
                data-tv-initial-focus
              >
                {tx.retry}
              </button>
            </StateBlock>
          ) : null}

          {libraryEmpty ? <StateBlock title={tx.emptyTitle} body={tx.emptyBody} /> : null}
          {showIdle ? <StateBlock title={tx.idleTitle} body={isTV ? tx.idleBodyTv : tx.idleBody(titleCount)} /> : null}
          {showNoResults ? (
            <StateBlock title={tx.noResultsTitle} body={tx.noResultsBody(q)}>
              <button type="button" onClick={clear} className={ACTION_BTN} tabIndex={0} data-focusable>
                {t('search.newSearch')}
              </button>
            </StateBlock>
          ) : null}
        </div>
      </div>

      {showResults ? (
        <div className="pt-4 sm:pt-6 pb-12 w-full min-w-0 max-w-full overflow-x-hidden border-t border-white/10" data-search-results>
          <section className="px-4 sm:px-8 lg:px-12 mb-8 tv:mb-10">
            <h2 className="text-base sm:text-lg tv:text-2xl font-semibold text-white/90 mb-3 tv:mb-5" aria-live="polite">
              {tx.results(hits.length)}
            </h2>
            <div
              className="dl-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 tv:grid-cols-3 gap-4 sm:gap-5 tv:gap-8"
              data-tv-list
            >
              {hits.map((hit, index) => (
                <ResultCard key={hit.key} hit={hit} tx={tx} initialFocus={index === 0} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
