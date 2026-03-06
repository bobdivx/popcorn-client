import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import RequestButton from '../requests/RequestButton';
import { useI18n } from '../../lib/i18n/useI18n';
import { ArrowLeft } from 'lucide-preact';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_IMG_BACKDROP = 'https://image.tmdb.org/t/p/original';

interface DiscoverMediaDetailProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

function formatReleaseDate(dateStr: string | undefined, language: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 4);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  return d.toLocaleDateString(locale, options);
}

function isReleaseDateFuture(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d > today;
}

export default function DiscoverMediaDetail({
  tmdbId,
  mediaType,
}: DiscoverMediaDetailProps) {
  const { t, language } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // Vérifier d'abord si un torrent existe déjà pour ce TMDB
        const groupRes = await serverApi.getTorrentGroupByTmdbId(tmdbId);
        if (groupRes.success && groupRes.data) {
          const groupData = groupRes.data as { variants?: unknown[]; variant_count?: number; slug?: string };
          const variants = groupData?.variants ?? [];
          const count = groupData?.variant_count ?? variants.length;
          if (count > 0 || variants.length > 0) {
            // Torrent disponible → rediriger vers la page détail torrent
            window.location.href = `/torrents?tmdbId=${tmdbId}&type=${mediaType}&from=discover`;
            return;
          }
        }

        // Pas de torrent → charger les infos TMDB pour la page Discover
        const lang = language === 'fr' ? 'fr-FR' : 'en-US';
        const [tmdbRes, requestsRes] = await Promise.all([
          mediaType === 'movie'
            ? serverApi.getTmdbMovieDetail(tmdbId, lang)
            : serverApi.getTmdbTvDetail(tmdbId, lang),
          serverApi.listMediaRequests({ limit: 200 }),
        ]);

        if (tmdbRes.success && tmdbRes.data) {
          setData(tmdbRes.data);
        } else {
          setError(tmdbRes.message || t('requests.errorLoad'));
        }

        // Vérifier si une demande existe déjà pour ce média
        if (requestsRes.success && Array.isArray(requestsRes.data)) {
          const exists = requestsRes.data.some(
            (r: { tmdb_id: number; media_type: string }) =>
              r.tmdb_id === tmdbId && r.media_type === mediaType
          );
          if (exists) setRequestSubmitted(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('requests.errorLoad'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tmdbId, mediaType, language]);

  const handleBack = () => {
    window.history.back();
  };

  if (loading) {
    return (
      <div class="min-h-[60vh] flex items-center justify-center">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div class="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <h1 class="text-2xl font-bold mb-3 text-white">{error || t('requests.errorLoad')}</h1>
        <a href="/dashboard" class="text-primary-400 hover:text-primary-300 font-medium">
          {t('common.back')} {t('nav.home')}
        </a>
      </div>
    );
  }

  const title = mediaType === 'movie' ? data.title : data.name;
  const releaseDate = mediaType === 'movie' ? data.release_date : data.first_air_date;
  const posterPath = data.poster_path ? `${TMDB_IMG_BASE}${data.poster_path}` : null;
  const backdropPath = data.backdrop_path ? `${TMDB_IMG_BACKDROP}${data.backdrop_path}` : null;

  return (
    <div class="min-h-screen bg-[#121212]">
      {/* Backdrop */}
      {backdropPath && (
        <div class="absolute inset-0 z-0">
          <img
            src={backdropPath}
            alt=""
            class="w-full h-full object-cover opacity-30"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/80 to-transparent" />
        </div>
      )}

      <div class="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-8">
        {/* Bouton retour */}
        <button
          onClick={handleBack}
          class="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          tabIndex={0}
        >
          <ArrowLeft class="w-5 h-5" />
          {t('common.back')}
        </button>

        <div class="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div class="flex-shrink-0 w-full md:w-64 lg:w-80">
            <div class="aspect-[2/3] rounded-xl overflow-hidden bg-white/5">
              {posterPath ? (
                <img
                  src={posterPath}
                  alt={title}
                  class="w-full h-full object-cover"
                />
              ) : (
                <div class="w-full h-full flex items-center justify-center text-gray-500 text-4xl">
                  {title?.slice(0, 2) || '?'}
                </div>
              )}
            </div>
          </div>

          {/* Contenu */}
          <div class="flex-1 min-w-0">
            <h1 class="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
            {releaseDate && (
              <p class="text-gray-400 mb-4">
                {isReleaseDateFuture(releaseDate)
                  ? t('discover.releaseDateExpected', { date: formatReleaseDate(releaseDate, language) })
                  : t('discover.releasedOn', { date: formatReleaseDate(releaseDate, language) })}
              </p>
            )}
            {data.vote_average != null && (
              <p class="text-gray-400 mb-4">
                ★ {data.vote_average.toFixed(1)} / 10
              </p>
            )}

            {data.overview && (
              <p class="text-gray-300 text-sm sm:text-base leading-relaxed mb-6">
                {data.overview}
              </p>
            )}

            <div class="glass-panel rounded-xl p-4 sm:p-6 mb-6">
              {requestSubmitted ? (
                <p class="text-primary-400 text-sm sm:text-base leading-relaxed font-medium flex items-center gap-2">
                  <span class="inline-block w-6 h-6 rounded-full bg-primary-500/30 flex items-center justify-center">✓</span>
                  {t('discover.requestSubmitted')}
                </p>
              ) : (
                <p class="text-gray-300 text-sm sm:text-base leading-relaxed">
                  {t('discover.noTorrentsYet')}
                </p>
              )}
            </div>

            {!requestSubmitted && (
              <RequestButton
                tmdbId={tmdbId}
                mediaType={mediaType}
                onSuccess={() => setRequestSubmitted(true)}
                onAlreadyExists={() => setRequestSubmitted(true)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
