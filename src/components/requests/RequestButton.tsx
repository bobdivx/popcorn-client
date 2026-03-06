import { useState, useEffect } from 'preact/hooks';
import { ClipboardList, Check, X } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';

interface RequestButtonProps {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  onSuccess?: () => void;
  onAlreadyExists?: () => void;
  onError?: (msg: string) => void;
  /** Afficher le bouton Annuler quand la demande existe (défaut: true sur MediaDetail) */
  showCancel?: boolean;
  className?: string;
}

export default function RequestButton({
  tmdbId,
  mediaType,
  onSuccess,
  onAlreadyExists,
  onError,
  showCancel = true,
  className = '',
}: RequestButtonProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await serverApi.listMediaRequests({ limit: 200 });
        if (res.success && Array.isArray(res.data)) {
          const found = res.data.find(
            (r: { tmdb_id: number; media_type: string }) =>
              r.tmdb_id === tmdbId && r.media_type === mediaType
          );
          if (found) {
            setRequestSubmitted(true);
            setRequestId(found.id);
          }
        }
      } catch {
        // Ignorer les erreurs de vérification
      }
    };
    check();
  }, [tmdbId, mediaType]);

  const handleRequest = async () => {
    try {
      setLoading(true);
      const res = await serverApi.createMediaRequest({
        tmdb_id: tmdbId,
        media_type: mediaType,
      });
      if (res.success) {
        const created = res.data as { id?: string } | undefined;
        if (created?.id) {
          setRequestId(created.id);
          setRequestSubmitted(true);
        }
        onSuccess?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notification', {
            detail: { type: 'success', message: t('requests.requestSuccess') },
          }));
        }
      } else {
        const msg = res.message || t('requests.errorLoad');
        onError?.(msg);
        if (res.message?.includes('déjà') || res.message?.includes('already') || (res as any).status === 409) {
          setRequestSubmitted(true);
          onAlreadyExists?.();
          const listRes = await serverApi.listMediaRequests({ limit: 200 });
          if (listRes.success && Array.isArray(listRes.data)) {
            const found = listRes.data.find(
              (r: { tmdb_id: number; media_type: string }) =>
                r.tmdb_id === tmdbId && r.media_type === mediaType
            );
            if (found) setRequestId(found.id);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notification', {
              detail: { type: 'info', message: t('requests.requestAlreadyExists') },
            }));
          }
        } else if (res.message?.includes('Quota') || res.message?.includes('quota')) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notification', {
              detail: { type: 'error', message: t('requests.quotaExceeded') },
            }));
          }
        } else {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notification', {
              detail: { type: 'error', message: msg },
            }));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('requests.errorLoad');
      onError?.(msg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notification', {
          detail: { type: 'error', message: msg },
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!requestId || cancelling) return;
    try {
      setCancelling(true);
      const res = await serverApi.deleteMediaRequest(requestId);
      if (res.success) {
        setRequestSubmitted(false);
        setRequestId(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('notification', {
            detail: { type: 'success', message: t('requests.requestCancelled') },
          }));
        }
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('notification', {
          detail: { type: 'error', message: t('requests.errorLoad') },
        }));
      }
    } finally {
      setCancelling(false);
    }
  };

  if (requestSubmitted) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-2 text-primary-400 font-medium px-4 py-2 rounded-lg bg-primary-500/20 border border-primary-500/40">
          <Check className="h-5 w-5" size={20} />
          {t('requests.requestSubmitted')}
        </span>
        {showCancel && requestId && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            data-focusable
            tabIndex={0}
            className={`inline-flex items-center gap-2 bg-white/10 hover:bg-red-500/30 text-white px-6 py-3 rounded-lg font-semibold text-lg transition-colors border border-white/20 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] ${className}`}
            title={t('requests.cancelRequest')}
          >
            {cancelling ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                {t('common.loading')}
              </>
            ) : (
              <>
                <X className="h-5 w-5" size={20} />
                {t('requests.cancelRequest')}
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleRequest}
      disabled={loading}
      data-focusable
      tabIndex={0}
      className={`inline-flex items-center gap-2 bg-glass hover:bg-glass-hover text-white px-6 py-3 rounded-lg font-semibold text-lg transition-colors border border-white/30 glass-panel focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] ${className}`}
      title={t('requests.requestMedia')}
    >
      {loading ? (
        <>
          <span className="loading loading-spinner loading-sm"></span>
          {t('common.loading')}
        </>
      ) : (
        <>
          <ClipboardList className="h-5 w-5" size={20} />
          {t('requests.requestMedia')}
        </>
      )}
    </button>
  );
}
