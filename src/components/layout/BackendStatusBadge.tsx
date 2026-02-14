import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { isTauri } from '../../lib/utils/tauri';
import { hasBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';

type BackendStatus = 'ok' | 'error' | 'checking' | 'unknown';

// Contrôles (démarrer/arrêter/redémarrer) uniquement sur desktop : builds qui embarquent client + serveur.
// Pas sur Android ni web : le serveur est en Docker ou distant, on ne peut pas le lancer depuis l’app.
// (Une API côté serveur ou une intégration Docker pourrait permettre un contrôle à distance plus tard.)
const DESKTOP_PLATFORMS = ['win32', 'linux', 'darwin'];

type BackendStatusBadgeProps = {
  variant?: 'standalone' | 'avatar' | 'inline';
  accountHref?: string;
  accountLabel?: string;
  children?: preact.ComponentChildren;
};

export default function BackendStatusBadge({
  variant = 'standalone',
  accountHref,
  accountLabel,
  children,
}: BackendStatusBadgeProps) {
  const { t } = useI18n();
  const [showBadge, setShowBadge] = useState(true);
  const [canControlServer, setCanControlServer] = useState(false);
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Afficher les boutons Démarrer/Arrêter/Redémarrer seulement sur Windows, Linux, macOS (Tauri desktop).
  // Sur Android / web : pastille informative uniquement (serveur Docker ou distant).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTauri()) {
        setCanControlServer(false);
        return;
      }
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const platform = await invoke<string>('get_platform').catch(() => '');
        if (cancelled) return;
        setCanControlServer(DESKTOP_PLATFORMS.includes(platform));
      } catch {
        if (!cancelled) setCanControlServer(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const checkHealth = async () => {
    setStatus('checking');
    setLastError(null);
    if (!hasBackendUrl()) {
      setStatus('unknown');
      return;
    }
    try {
      const res = await serverApi.getSetupStatus();
      if (res.success && res.data) {
        setStatus(res.data.backendReachable ? 'ok' : 'error');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(() => {
      // Déléguer le travail à la prochaine tâche pour éviter [Violation] 'setInterval' handler took Xms
      setTimeout(checkHealth, 0);
    }, 20_000);
    return () => clearInterval(interval);
  }, []);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  const runAction = async (action: 'start' | 'stop' | 'restart') => {
    if (actionLoading) return;
    setActionLoading(action);
    setLastError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (action === 'stop' || action === 'restart') {
        await invoke('stop_server');
        await new Promise((r) => setTimeout(r, 800));
      }
      if (action === 'start' || action === 'restart') {
        await invoke('start_server');
        await new Promise((r) => setTimeout(r, 1500));
      }
      await checkHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      setStatus('error');
    } finally {
      setActionLoading(null);
    }
  };

  const isOk = status === 'ok';
  const isError = status === 'error' || status === 'unknown';

  const statusLabel = status === 'checking' ? t('backend.statusChecking') : isOk ? t('backend.statusOk') : t('backend.statusError');
  const serverBlock = (
    <>
      <div className="px-3 py-2 border-b border-white/10 mb-2">
        <p className="text-xs font-medium text-white/90 flex items-center gap-2 flex-wrap">
          <span>{t('backend.menuTitle')}</span>
          <span className="flex items-center gap-1.5 text-white/70">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isOk ? 'bg-green-400' : isError ? 'bg-red-400' : 'bg-white/60 animate-pulse'
              }`}
              aria-hidden
            />
            <span>{statusLabel}</span>
          </span>
        </p>
        {lastError && (
          <p className="text-xs text-red-400 mt-1 truncate" title={lastError}>{lastError}</p>
        )}
      </div>
      {canControlServer ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction('start')}
            disabled={actionLoading !== null}
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'start' ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="w-4 text-green-400">▶</span>
            )}
            {t('backend.startServer')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction('stop')}
            disabled={actionLoading !== null}
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'stop' ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="w-4 text-red-400">■</span>
            )}
            {t('backend.stopServer')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction('restart')}
            disabled={actionLoading !== null}
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading === 'restart' ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <span className="w-4 text-amber-400">↻</span>
            )}
            {t('backend.restartServer')}
          </button>
        </>
      ) : (
        <p className="px-3 py-2 text-sm text-white/80">
          {status === 'checking' ? t('backend.statusChecking') : isOk ? t('backend.statusOk') : t('backend.statusError')}
        </p>
      )}
    </>
  );

  if (variant === 'inline') {
    return <div className="w-full" role="region" aria-label={t('backend.menuTitle')}>{serverBlock}</div>;
  }

  const statusRingClass =
    variant === 'avatar'
      ? `ring-2 rounded-full p-0.5 ${
          isOk ? 'ring-green-500' : isError ? 'ring-red-500' : 'ring-white/50'
        }`
      : '';

  const trigger =
    variant === 'avatar' && children ? (
      <span className={`inline-flex shrink-0 ${statusRingClass}`}>{children}</span>
    ) : (
      <>
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isOk ? 'bg-green-300' : isError ? 'bg-red-300' : 'bg-white/70 animate-pulse'
          }`}
        />
        <span className="hidden sm:inline">
          {status === 'checking' ? t('backend.statusChecking') : isOk ? t('backend.statusOk') : t('backend.statusError')}
        </span>
      </>
    );

  const buttonClass =
    variant === 'avatar'
      ? 'rounded-full p-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#121212] cursor-pointer'
      : `flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-[#121212] ${
          isOk
            ? 'bg-green-600/90 text-white hover:bg-green-500'
            : isError
              ? 'bg-red-600/90 text-white hover:bg-red-500'
              : 'bg-white/20 text-white/90 hover:bg-white/30'
        }`;

  return (
    <div className="relative flex items-center" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className={buttonClass}
        title={isOk ? t('backend.badgeTitleOk') : isError ? t('backend.badgeTitleError') : t('backend.badgeTitleChecking')}
        aria-label={variant === 'avatar' && accountLabel ? accountLabel : isOk ? t('backend.badgeTitleOk') : isError ? t('backend.badgeTitleError') : t('backend.badgeTitleChecking')}
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        {trigger}
      </button>

      {menuOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-52 rounded-xl bg-gray-900 border border-white/20 shadow-xl py-2 z-[100]"
          role="menu"
        >
          {variant === 'avatar' && accountHref && accountLabel && (
            <>
              <a
                href={accountHref}
                className="block px-3 py-2.5 text-sm text-white hover:bg-white/10 rounded-t-xl"
                role="menuitem"
              >
                {accountLabel}
              </a>
              <div className="border-b border-white/10 my-1" aria-hidden />
            </>
          )}
          {serverBlock}
        </div>
      )}
    </div>
  );
}
