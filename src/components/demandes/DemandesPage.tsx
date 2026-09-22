import { useState, useEffect, useMemo } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { MediaRequest } from '../../lib/client/server-api/requests';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { CarouselSection } from '../page-model/CarouselSection';
import { PageContainer } from '../page-model/PageContainer';
import { PageHeader } from '../page-model/PageHeader';
import { PosterCard } from '../page-model/PosterCard';
import { pickHeroItems } from '../dashboard/utils/browsePriority';
import { buildStrictTmdbDetailUrlFromContentItem } from '../../lib/utils/media-detail-url';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/original';

interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

interface LibraryRow {
  tmdb_id?: number;
  tmdb_type?: string;
}

function toContentItem(item: TmdbItem, type: 'movie' | 'tv'): ContentItem {
  const title = item.title || item.name || '';
  const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : null;
  const backdrop = item.backdrop_path ? `${TMDB_IMG_BACKDROP}${item.backdrop_path}` : null;
  const date = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb-${item.id}-${type}`,
    title,
    tmdbTitle: title,
    type,
    poster: poster || undefined,
    backdrop: backdrop || undefined,
    overview: item.overview || undefined,
    rating: item.vote_average,
    releaseDate: date ? date.slice(0, 4) : undefined,
    firstAirDate: item.first_air_date,
    tmdbId: item.id,
  };
}

function formatDateForApi(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function requestStatusLabel(
  status: number,
  inLibrary: boolean,
  t: (key: string) => string
): string {
  if (inLibrary) return t('requests.available');
  if (status === 1) return t('requests.statusPending');
  if (status === 2) return t('requests.statusApproved');
  if (status === 3) return t('requests.statusDeclined');
  return t('requests.statusUnknown');
}

function requestStatusTone(
  status: number,
  inLibrary: boolean
): 'ok' | 'pending' | 'bad' | 'neutral' {
  if (inLibrary || status === 2) return 'ok';
  if (status === 1) return 'pending';
  if (status === 3) return 'bad';
  return 'neutral';
}

export default function DemandesPage() {
  const { t, language } = useI18n();
  const [cinemaReleases, setCinemaReleases] = useState<TmdbItem[]>([]);
  const [vodReleases, setVodReleases] = useState<TmdbItem[]>([]);
  const [newSeries, setNewSeries] = useState<TmdbItem[]>([]);
  const [myRequests, setMyRequests] = useState<MediaRequest[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [searching, setSearching] = useState(false);

  const lang = language === 'fr' ? 'fr-FR' : 'en-US';

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const today = formatDateForApi(new Date());
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const vodStart = formatDateForApi(threeMonthsAgo);

        const [cinemaRes, vodRes, newTvRes, myRequestsRes, libraryRes] = await Promise.all([
          serverApi.discoverMovies({
            page: 1,
            language: lang,
            sort_by: 'primary_release_date.desc',
            primary_release_date_lte: today,
          }),
          serverApi.discoverMovies({
            page: 1,
            language: lang,
            sort_by: 'primary_release_date.desc',
            primary_release_date_gte: vodStart,
            primary_release_date_lte: today,
          }),
          serverApi.discoverTv({
            page: 1,
            language: lang,
            sort_by: 'first_air_date.desc',
            first_air_date_lte: today,
          }),
          serverApi.listMediaRequests({ limit: 50 }),
          serverApi.getLibrary(),
        ]);

        if (cinemaRes.success && cinemaRes.data?.results) {
          setCinemaReleases(cinemaRes.data.results.slice(0, 20));
        }
        if (vodRes.success && vodRes.data?.results) {
          setVodReleases(vodRes.data.results);
        }
        if (newTvRes.success && newTvRes.data?.results) {
          setNewSeries(newTvRes.data.results);
        }
        if (myRequestsRes.success && myRequestsRes.data) {
          setMyRequests(myRequestsRes.data);
        }
        if (libraryRes.success && libraryRes.data) {
          setLibraryItems(libraryRes.data as LibraryRow[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [language]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const res = await serverApi.searchTmdb({ q: term, type: 'all', language: lang, page: 1 });
      if (cancelled) return;
      if (res.success && res.data) {
        setSearchResults(
          res.data.map((r) => ({
            id: r.id || `tmdb-${r.tmdbId}-${r.type}`,
            title: r.title,
            tmdbTitle: r.title,
            type: r.type === 'tv' ? 'tv' : 'movie',
            poster: r.poster,
            overview: r.overview,
            releaseDate: r.year ? String(r.year) : undefined,
            tmdbId: r.tmdbId,
          }))
        );
      } else {
        setSearchResults([]);
      }
      setSearching(false);
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, lang]);

  const isInLibrary = (tmdbId: number | undefined, type: string | undefined) =>
    tmdbId != null &&
    libraryItems.some((lib) => lib.tmdb_id === tmdbId && lib.tmdb_type === type);

  const matchingRequest = (tmdbId: number | undefined, type: string | undefined) =>
    myRequests.find((r) => r.tmdb_id === tmdbId && r.media_type === type);

  const badgeFor = (item: ContentItem): { label: string; tone: 'ok' | 'pending' | 'bad' | 'neutral' } | null => {
    const inLibrary = item.availableInLibrary === true || isInLibrary(item.tmdbId, item.type);
    const req = matchingRequest(item.tmdbId, item.type);
    if (inLibrary) return { label: t('requests.available'), tone: 'ok' };
    if (!req) return null;
    return { label: requestStatusLabel(req.status, false, t), tone: requestStatusTone(req.status, false) };
  };

  const annotate = (item: ContentItem): ContentItem => ({
    ...item,
    availableInLibrary: item.availableInLibrary === true || isInLibrary(item.tmdbId, item.type),
  });

  const requestItems = useMemo(() => {
    return myRequests.map((r) => {
      const inLibrary = libraryItems.some(
        (lib) => lib.tmdb_id === r.tmdb_id && lib.tmdb_type === r.media_type
      );
      const item: ContentItem = {
        id: r.id,
        tmdbId: r.tmdb_id,
        type: r.media_type as 'movie' | 'tv',
        title: r.title || `TMDB ${r.tmdb_id}`,
        poster: r.poster_path || undefined,
        availableInLibrary: inLibrary,
      };
      return {
        item,
        badge: requestStatusLabel(r.status, inLibrary, t),
        tone: requestStatusTone(r.status, inLibrary),
      };
    });
  }, [myRequests, libraryItems, t]);

  const heroItems = useMemo(() => {
    const cinema = cinemaReleases
      .filter((m) => m.poster_path || m.backdrop_path)
      .map((m) => toContentItem(m, 'movie'));
    const series = newSeries
      .filter((m) => m.poster_path || m.backdrop_path)
      .map((m) => toContentItem(m, 'tv'));
    return pickHeroItems(cinema, series);
  }, [cinemaReleases, newSeries]);

  const handleOpen = (item: ContentItem) => {
    const tmdbId = item.tmdbId;
    const type = item.type || 'movie';
    if (!tmdbId) return;
    const inLibrary = item.availableInLibrary === true || isInLibrary(tmdbId, type);
    if (inLibrary) {
      window.location.href = buildStrictTmdbDetailUrlFromContentItem(
        { ...item, availableInLibrary: true },
        'demandes'
      );
      return;
    }
    window.location.href = `/discover?tmdbId=${tmdbId}&type=${type}&from=demandes`;
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-black pt-4 sm:pt-6">
        <TorrentCardsShadowLoader rows={2} showHero />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
        <p className="text-red-400 text-center mb-4">{error}</p>
      </div>
    );
  }

  const trimmed = query.trim();
  const showSearch = trimmed.length >= 2;

  return (
    <PageContainer
      pageId="demandes"
      heroItems={heroItems}
      onHeroPlay={handleOpen}
      heroPrimaryButtonLabel={t('requests.requestMedia')}
      heroPrimaryButtonIcon={
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 tv:h-8 tv:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      }
    >
      <PageHeader title={t('nav.demandes')} subtitle={t('discover.pageSubtitle')} />

      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pb-2">
        <label className="block">
          <span className="sr-only">{t('requests.searchPlaceholder')}</span>
          <input
            type="search"
            value={query}
            data-focusable
            data-tv-page-action
            placeholder={t('requests.searchPlaceholder')}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            className="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 tv:px-7 tv:py-4 text-base tv:text-xl text-white placeholder:text-white/40 outline-none focus:border-violet-400 focus:bg-white/10"
          />
        </label>
      </div>

      <div className="pb-8 tv:pb-12 pt-2 tv:pt-4 overflow-visible">
        {requestItems.length > 0 && (
          <CarouselSection title={t('requests.myRequests')}>
            {requestItems.map(({ item, badge, tone }) => (
              <PosterCard key={item.id} item={item} badge={badge} badgeTone={tone} onNavigate={handleOpen} />
            ))}
          </CarouselSection>
        )}

        {showSearch && !searching && searchResults.length === 0 && (
          <p className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 py-8 text-white/60">
            {t('search.noResults')}
          </p>
        )}

        {showSearch && (searching || searchResults.length > 0) && (
          <CarouselSection title={searching ? t('common.loading') : t('requests.results')}>
            {searchResults.map((raw) => {
              const item = annotate(raw);
              const badge = badgeFor(item);
              return (
                <PosterCard
                  key={item.id}
                  item={item}
                  badge={badge?.label}
                  badgeTone={badge?.tone}
                  onNavigate={handleOpen}
                />
              );
            })}
          </CarouselSection>
        )}

        {!showSearch && cinemaReleases.length > 0 && (
          <CarouselSection title={t('discover.cinemaReleases')}>
            {cinemaReleases.map((m) => {
              const item = annotate(toContentItem(m, 'movie'));
              const badge = badgeFor(item);
              return <PosterCard key={m.id} item={item} badge={badge?.label} badgeTone={badge?.tone} onNavigate={handleOpen} />;
            })}
          </CarouselSection>
        )}

        {!showSearch && vodReleases.length > 0 && (
          <CarouselSection title={t('discover.vodReleases')}>
            {vodReleases.map((m) => {
              const item = annotate(toContentItem(m, 'movie'));
              const badge = badgeFor(item);
              return <PosterCard key={m.id} item={item} badge={badge?.label} badgeTone={badge?.tone} onNavigate={handleOpen} />;
            })}
          </CarouselSection>
        )}

        {!showSearch && newSeries.length > 0 && (
          <CarouselSection title={t('discover.newReleases')}>
            {newSeries.map((s) => {
              const item = annotate(toContentItem(s, 'tv'));
              const badge = badgeFor(item);
              return <PosterCard key={s.id} item={item} badge={badge?.label} badgeTone={badge?.tone} onNavigate={handleOpen} />;
            })}
          </CarouselSection>
        )}
      </div>
    </PageContainer>
  );
}
