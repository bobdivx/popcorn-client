import { useEffect, useState } from 'preact/hooks';
import { WifiOff, AlertTriangle } from 'lucide-preact';
import {
  getBackendConnectionStore,
  subscribeBackendConnectionStore,
  checkBackendConnection,
  type BackendConnectionState,
} from '../../lib/backend-connection-store';
import { getBackendUrl, getMyBackendUrl, getConfiguredBackendUrl } from '../../lib/backend-config';
import { useI18n } from '../../lib/i18n/useI18n';

/**
 * Bannière sous la navbar :
 * - offline : API backend injoignable
 * - degraded : API up mais client torrent (librqbit) saturé/injoignable
 */
export default function BackendOfflineBanner() {
  const { t } = useI18n();
  const [state, setState] = useState<BackendConnectionState>(() => getBackendConnectionStore());
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    return subscribeBackendConnectionStore((s) => setState({ ...s }));
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const myUrl = getMyBackendUrl();
    const currentUrl = getBackendUrl();
    const isFriendBackend = myUrl != null && currentUrl !== myUrl;
    if (!isFriendBackend && state.status === 'offline') {
      document.body.dataset.backendOffline = 'true';
      delete document.body.dataset.backendDegraded;
    } else if (!isFriendBackend && state.status === 'degraded') {
      document.body.dataset.backendDegraded = 'true';
      delete document.body.dataset.backendOffline;
    } else {
      delete document.body.dataset.backendOffline;
      delete document.body.dataset.backendDegraded;
    }
    return () => {
      delete document.body.dataset.backendOffline;
      delete document.body.dataset.backendDegraded;
    };
  }, [state.status]);

  const handleRetry = async () => {
    setRetrying(true);
    await checkBackendConnection();
    setRetrying(false);
  };

  // Ne pas afficher quand c’est le serveur d’un ami qui est offline (pas le mien)
  const myUrl = typeof window !== 'undefined' ? getMyBackendUrl() : null;
  const currentUrl = typeof window !== 'undefined' ? getBackendUrl() : '';
  if (myUrl != null && currentUrl !== myUrl) return null;

  if (state.status !== 'offline' && state.status !== 'degraded') return null;

  const configuredUrl = typeof window !== 'undefined' ? getConfiguredBackendUrl() : null;
  const isDegraded = state.status === 'degraded';

  return (
    <div
      className={`fixed left-0 right-0 z-40 flex flex-wrap items-center justify-center gap-2 gap-y-1 px-4 py-2 text-sm font-medium border-b ${
        isDegraded
          ? 'bg-amber-900/90 text-white border-amber-700/50'
          : 'bg-red-900/90 text-white border-red-700/50'
      }`}
      style={{
        paddingTop: 'calc(var(--safe-area-inset-top) + 0.5rem)',
        paddingBottom: '0.5rem',
        top: 'var(--navbar-height, 4rem)',
      }}
      role="alert"
      aria-live="polite"
    >
      {isDegraded ? (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
      ) : (
        <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden />
      )}
      <span>
        {isDegraded
          ? t('settingsMenu.overviewCard.serverDegraded')
          : t('settingsMenu.overviewCard.serverOffline')}
      </span>
      {isDegraded && state.lastError && (
        <span className="text-white/80 truncate max-w-[16rem] sm:max-w-md" title={state.lastError}>
          ({state.lastError})
        </span>
      )}
      {!isDegraded && configuredUrl && (
        <span className="text-white/80 truncate max-w-[12rem] sm:max-w-none" title={configuredUrl}>
          ({configuredUrl.replace(/^https?:\/\//, '')})
        </span>
      )}
      <a
        href="/settings/server"
        className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 underline focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        {t('settingsMenu.overviewCard.serverOfflineConfigureUrl')}
      </a>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors"
      >
        {retrying ? t('common.loading') : t('common.retry')}
      </button>
    </div>
  );
}
