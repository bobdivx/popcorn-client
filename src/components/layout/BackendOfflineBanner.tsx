import { useEffect, useState } from 'preact/hooks';
import { WifiOff } from 'lucide-preact';
import {
  getBackendConnectionStore,
  subscribeBackendConnectionStore,
  checkBackendConnection,
  type BackendConnectionState,
} from '../../lib/backend-connection-store';
import { getBackendUrl, getMyBackendUrl } from '../../lib/backend-config';
import { useI18n } from '../../lib/i18n/useI18n';

/**
 * Bannière affichée sous la navbar quand le backend est détecté hors ligne
 * (échecs API ConnectionError/Timeout ou health check). Bouton « Réessayer » pour relancer un check.
 * Masquée quand le backend actuel est un serveur d’ami (pas « mon serveur ») pour ne pas inquiéter l’utilisateur.
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
    } else {
      delete document.body.dataset.backendOffline;
    }
    return () => {
      delete document.body.dataset.backendOffline;
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

  if (state.status !== 'offline') return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium bg-red-900/90 text-white border-b border-red-700/50"
      style={{
        paddingTop: 'calc(var(--safe-area-inset-top) + 0.5rem)',
        paddingBottom: '0.5rem',
        top: 'var(--navbar-height, 4rem)',
      }}
      role="alert"
      aria-live="polite"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span>{t('settingsMenu.overviewCard.serverOffline')}</span>
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
