import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { MediaRequest } from '../../lib/client/server-api/requests';
import { useI18n } from '../../lib/i18n/useI18n';
import { CheckCircle, XCircle, Clock, Film, Tv } from 'lucide-preact';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

const STATUS_PENDING = 1;
const STATUS_APPROVED = 2;
const STATUS_DECLINED = 3;

export default function RequestsAdminManager() {
  const { t } = useI18n();
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actioning, setActioning] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const status = filter === 'all' ? undefined : filter;
      const res = await serverApi.listMediaRequests({ status, limit: 100 });
      if (res.success && res.data) {
        setRequests(res.data);
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const handleApprove = async (id: string) => {
    setActioning(id);
    try {
      const res = await serverApi.updateRequestStatus(id, {
        status: 'approved',
        notes: notes[id] || undefined,
      });
      if (res.success) {
        await loadRequests();
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    } finally {
      setActioning(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActioning(id);
    try {
      const res = await serverApi.updateRequestStatus(id, {
        status: 'declined',
        notes: notes[id] || undefined,
      });
      if (res.success) {
        await loadRequests();
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    } finally {
      setActioning(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === STATUS_PENDING);

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[200px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div class="space-y-6 min-w-0">
      <h1 class="text-lg sm:text-2xl font-bold text-white truncate">{t('requestsAdmin.title')}</h1>

      <div class="glass-panel rounded-xl p-4 sm:p-6 text-gray-300 text-sm sm:text-base leading-relaxed min-w-0 overflow-hidden">
        <p class="break-words">{t('requestsAdmin.explanation')}</p>
      </div>

      <div class="flex flex-wrap gap-2 min-w-0">
        {['pending', 'approved', 'declined', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            class={`btn btn-sm min-w-0 ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
          >
            <span class="truncate max-w-[120px] sm:max-w-none">
              {f === 'pending' && t('requests.statusPending')}
              {f === 'approved' && t('requests.statusApproved')}
              {f === 'declined' && t('requests.statusDeclined')}
              {f === 'all' && t('common.all')}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div class="alert alert-error flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 overflow-hidden">
          <span class="break-words flex-1 min-w-0">{error}</span>
          <button class="btn btn-sm btn-ghost flex-shrink-0" onClick={loadRequests}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {filter === 'pending' && pendingRequests.length === 0 && (
        <p class="text-gray-400 break-words">{t('requestsAdmin.noPendingRequests')}</p>
      )}

      {requests.length === 0 && filter !== 'pending' && (
        <p class="text-gray-400 break-words">{t('requests.noRequests')}</p>
      )}

      <div class="space-y-4 min-w-0">
        {requests.map((req) => (
          <div
            key={req.id}
            class="glass-panel rounded-xl p-4 sm:p-6 flex flex-col gap-4 min-w-0 overflow-hidden"
          >
            <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <div class="text-gray-400 flex-shrink-0">
                  {req.media_type === 'movie' ? (
                    <Film class="w-4 h-4" />
                  ) : (
                    <Tv class="w-4 h-4" />
                  )}
                </div>
                <div class="flex-1 min-w-0 overflow-hidden">
                  <p class="font-medium text-white truncate">
                    TMDB #{req.tmdb_id} ({req.media_type === 'movie' ? t('common.film') : t('common.serie')})
                  </p>
                  <p class="text-sm text-gray-400 truncate">
                    {new Date(req.created_at * 1000).toLocaleDateString()} · {req.requested_by}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                {req.status === STATUS_PENDING && (
                  <>
                    <span class="text-amber-400">
                      <Clock class="w-5 h-5 inline" />
                    </span>
                    <span class="text-sm text-amber-400 whitespace-nowrap">{t('requests.statusPending')}</span>
                  </>
                )}
                {req.status === STATUS_APPROVED && (
                  <>
                    <CheckCircle class="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span class="text-sm text-green-400 whitespace-nowrap">{t('requests.statusApproved')}</span>
                  </>
                )}
                {req.status === STATUS_DECLINED && (
                  <>
                    <XCircle class="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span class="text-sm text-red-400 whitespace-nowrap">{t('requests.statusDeclined')}</span>
                  </>
                )}
              </div>
            </div>

            {req.status === STATUS_PENDING && (
              <div class="flex flex-col gap-2 min-w-0">
                <input
                  type="text"
                  placeholder={t('requestsAdmin.notes')}
                  value={notes[req.id] || ''}
                  onInput={(e) =>
                    setNotes((prev) => ({
                      ...prev,
                      [req.id]: (e.target as HTMLInputElement).value,
                    }))
                  }
                  class="input input-bordered flex-1 min-w-0 w-full"
                />
                <div class="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={actioning === req.id}
                    class="btn btn-success btn-sm flex-1 sm:flex-none min-w-0 inline-flex items-center justify-center gap-1"
                  >
                    {actioning === req.id ? (
                      <span class="loading loading-spinner loading-sm"></span>
                    ) : (
                      <CheckCircle class="w-4 h-4 flex-shrink-0" />
                    )}
                    <span class="truncate">{t('requestsAdmin.approve')}</span>
                  </button>
                  <button
                    onClick={() => handleDecline(req.id)}
                    disabled={actioning === req.id}
                    class="btn btn-error btn-sm flex-1 sm:flex-none min-w-0 inline-flex items-center justify-center gap-1"
                  >
                    {actioning === req.id ? (
                      <span class="loading loading-spinner loading-sm"></span>
                    ) : (
                      <XCircle class="w-4 h-4 flex-shrink-0" />
                    )}
                    <span class="truncate">{t('requestsAdmin.decline')}</span>
                  </button>
                </div>
              </div>
            )}

            {req.notes && (
              <p class="text-sm text-gray-400 break-words">{req.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
