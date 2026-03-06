import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { MediaRequest } from '../../lib/client/server-api/requests';
import { useI18n } from '../../lib/i18n/useI18n';
import { Clock, CheckCircle, XCircle, Film, Tv, Trash2 } from 'lucide-preact';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

const STATUS_PENDING = 1;
const STATUS_APPROVED = 2;
const STATUS_DECLINED = 3;

interface TmdbInfo {
  title: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
}

interface RequestWithTmdb extends MediaRequest {
  tmdbInfo?: TmdbInfo;
}

function statusIcon(status: number) {
  switch (status) {
    case STATUS_PENDING:
      return <Clock class="w-5 h-5 text-amber-400" />;
    case STATUS_APPROVED:
      return <CheckCircle class="w-5 h-5 text-green-400" />;
    case STATUS_DECLINED:
      return <XCircle class="w-5 h-5 text-red-400" />;
    default:
      return <Clock class="w-5 h-5 text-gray-400" />;
  }
}

function statusBadgeClass(status: number) {
  switch (status) {
    case STATUS_PENDING:
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case STATUS_APPROVED:
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case STATUS_DECLINED:
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export default function MyRequests() {
  const { t, locale } = useI18n();
  const [requests, setRequests] = useState<RequestWithTmdb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await serverApi.listMediaRequests({ limit: 100 });
      if (res.success && res.data) {
        // Charger les infos TMDB pour chaque demande
        const requestsWithTmdb = await Promise.all(
          res.data.map(async (req) => {
            try {
              const tmdbLang = locale === 'fr' ? 'fr-FR' : 'en-US';
              const tmdbRes = req.media_type === 'movie'
                ? await serverApi.getTmdbMovieDetail(req.tmdb_id, tmdbLang)
                : await serverApi.getTmdbTvDetail(req.tmdb_id, tmdbLang);
              
              if (tmdbRes.success && tmdbRes.data) {
                const data = tmdbRes.data;
                return {
                  ...req,
                  tmdbInfo: {
                    title: data.title || data.name || `TMDB #${req.tmdb_id}`,
                    poster_path: data.poster_path,
                    release_date: data.release_date,
                    first_air_date: data.first_air_date,
                    overview: data.overview,
                  },
                };
              }
            } catch {
              // Ignorer les erreurs TMDB
            }
            return req;
          })
        );
        setRequests(requestsWithTmdb);
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('requests.confirmDelete'))) return;
    setDeletingId(id);
    try {
      const res = await serverApi.deleteMediaRequest(id);
      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const getStatusLabel = (status: number) => {
    switch (status) {
      case STATUS_PENDING:
        return t('requests.statusPending');
      case STATUS_APPROVED:
        return t('requests.statusApproved');
      case STATUS_DECLINED:
        return t('requests.statusDeclined');
      default:
        return t('requests.statusUnknown');
    }
  };

  const getMediaTypeIcon = (type: string) => {
    return type === 'movie' ? <Film class="w-4 h-4" /> : <Tv class="w-4 h-4" />;
  };

  const getPosterUrl = (path: string | null | undefined) => {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/w185${path}`;
  };

  const getReleaseYear = (req: RequestWithTmdb) => {
    const date = req.tmdbInfo?.release_date || req.tmdbInfo?.first_air_date;
    if (!date) return null;
    return date.slice(0, 4);
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[200px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div class="min-h-screen bg-[#121212] p-4 sm:p-6 md:p-8">
      <div class="max-w-5xl mx-auto">
        <h1 class="text-2xl sm:text-3xl font-bold text-white mb-6">
          {t('requests.myRequests')}
        </h1>

        <div class="glass-panel rounded-xl p-4 sm:p-6 text-gray-300 text-sm sm:text-base leading-relaxed mb-6">
          <p>{t('requests.myRequestsExplanation')}</p>
        </div>

        {error && (
          <div class="alert alert-error mb-6">
            <span>{error}</span>
            <button class="btn btn-sm btn-ghost" onClick={loadRequests}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {!error && requests.length === 0 && (
          <div class="glass-panel rounded-xl p-8 text-center">
            <p class="text-gray-400 text-lg mb-4">{t('requests.noRequests')}</p>
            <a href="/dashboard" class="btn btn-primary">
              {t('requests.discoverContent')}
            </a>
          </div>
        )}

        {!error && requests.length > 0 && (
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {requests.map((req) => {
              const posterUrl = getPosterUrl(req.tmdbInfo?.poster_path);
              const title = req.tmdbInfo?.title || `TMDB #${req.tmdb_id}`;
              const year = getReleaseYear(req);
              
              return (
                <div
                  key={req.id}
                  class="glass-panel rounded-xl overflow-hidden flex flex-col group hover:ring-2 hover:ring-primary-500/50 transition-all"
                >
                  {/* Poster + Overlay */}
                  <div class="relative aspect-[2/3] bg-gray-800">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={title}
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                        {req.media_type === 'movie' ? (
                          <Film class="w-16 h-16 text-gray-600" />
                        ) : (
                          <Tv class="w-16 h-16 text-gray-600" />
                        )}
                      </div>
                    )}
                    
                    {/* Status badge overlay */}
                    <div class="absolute top-2 right-2">
                      <div class={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${statusBadgeClass(req.status)}`}>
                        {statusIcon(req.status)}
                        <span class="text-xs font-medium">{getStatusLabel(req.status)}</span>
                      </div>
                    </div>

                    {/* Media type badge */}
                    <div class="absolute top-2 left-2">
                      <div class="flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white/80 text-xs">
                        {getMediaTypeIcon(req.media_type)}
                        <span>{req.media_type === 'movie' ? t('common.film') : t('common.serie')}</span>
                      </div>
                    </div>

                    {/* Delete button (pending only) */}
                    {req.status === STATUS_PENDING && (
                      <button
                        onClick={() => handleDelete(req.id)}
                        disabled={deletingId === req.id}
                        class="absolute bottom-2 right-2 p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title={t('requests.cancelRequest')}
                      >
                        {deletingId === req.id ? (
                          <HLSLoadingSpinner size="sm" />
                        ) : (
                          <Trash2 class="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Info */}
                  <div class="p-4 flex-1 flex flex-col">
                    <h3 class="font-semibold text-white text-lg line-clamp-2 mb-1">
                      {title}
                    </h3>
                    {year && (
                      <p class="text-sm text-gray-400 mb-2">{year}</p>
                    )}
                    <p class="text-xs text-gray-500 mt-auto">
                      {t('requests.requestedOn')} {new Date(req.created_at * 1000).toLocaleDateString()}
                    </p>
                    {req.notes && (
                      <p class="text-xs text-gray-400 mt-2 italic line-clamp-2">
                        {req.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
