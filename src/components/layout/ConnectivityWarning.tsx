import { useSeedingHealth, type SeedingDiagnostic } from '../../hooks/useSeedingHealth';
import { AlertTriangle, Info, X } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { isTVPlatform } from '../../lib/utils/device-detection';
import {
  connectivityWarningFingerprint,
  readConnectivityDismissedFingerprint,
  writeConnectivityDismissedFingerprint,
  clearConnectivityDismissedFingerprint,
} from '../../lib/connectivity-warning';

type Props = {
  /** Avatar (ou autre trigger) sur lequel afficher la pastille de notif. */
  children: ComponentChildren;
  className?: string;
  accountHref?: string;
  accountLabel?: string;
};

/**
 * Affiche une pastille de notification sur l'avatar du header
 * lorsqu'un problème de partage BitTorrent est détecté (plus de carte flottante).
 */
export default function ConnectivityWarning({
  children,
  className = '',
  accountHref = '/settings/account',
  accountLabel,
}: Props) {
  const { diagnostic, loading } = useSeedingHealth();
  const { t } = useI18n();
  const prevStatusRef = useRef<SeedingDiagnostic['status'] | undefined>();
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(() =>
    readConnectivityDismissedFingerprint()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isTvNav, setIsTvNav] = useState(false);

  useEffect(() => {
    setIsTvNav(isTVPlatform());
  }, []);

  const fingerprint =
    diagnostic && diagnostic.status !== 'ok' ? connectivityWarningFingerprint(diagnostic) : '';

  useEffect(() => {
    if (!diagnostic) return;

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = diagnostic.status;

    if (prevStatus === 'ok' && diagnostic.status !== 'ok') {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
      return;
    }

    if (!fingerprint) return;

    const stored = readConnectivityDismissedFingerprint();
    if (stored && stored !== fingerprint) {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
    }
  }, [diagnostic?.status, fingerprint]);

  const isDismissed = fingerprint !== '' && dismissedFingerprint === fingerprint;
  const hasIssue =
    !loading && !!diagnostic && diagnostic.status !== 'ok' && !isDismissed;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[data-focusable], a[href], button');
    first?.focus();
  }, [menuOpen]);

  useEffect(() => {
    const el = rootRef.current as (HTMLDivElement & { _tvBack?: () => void }) | null;
    if (!el || !menuOpen) return;
    el.setAttribute('data-tv-back-handler', '');
    el._tvBack = () => setMenuOpen(false);
    return () => {
      el.removeAttribute('data-tv-back-handler');
      delete el._tvBack;
    };
  }, [menuOpen]);

  const handleDismiss = () => {
    if (!fingerprint) return;
    setDismissedFingerprint(fingerprint);
    setMenuOpen(false);
    writeConnectivityDismissedFingerprint(fingerprint);
  };

  const isError = diagnostic?.status === 'error';
  const badgeClass = isError ? 'bg-red-500' : 'bg-amber-500';
  const title = isError
    ? t('connectivity.errorTitle')
    : t('connectivity.warningTitle');
  const detail =
    diagnostic?.warnings?.[0] || t('connectivity.defaultDetail');
  const resolvedAccountLabel = accountLabel || t('nav.account');

  const handleTriggerCapture = (event: MouseEvent) => {
    if (!isTvNav || !hasIssue) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-connectivity-menu], [data-connectivity-badge]')) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen((open) => !open);
  };

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex ${className}`}
      onClickCapture={handleTriggerCapture}
    >
      {children}
      {hasIssue && (
        <>
          <button
            type="button"
            data-connectivity-badge
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className={`absolute -top-0.5 -right-0.5 z-10 flex h-4 min-w-4 tv:h-7 tv:min-w-7 items-center justify-center rounded-full ${badgeClass} text-[9px] tv:text-xs font-bold text-[#fff] shadow-md ring-2 ring-[var(--ds-surface-elevated,#0a0a0a)] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-violet)]`}
            aria-label={title}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={title}
            data-focusable
            tabIndex={0}
          >
            {isError ? '!' : '1'}
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              data-connectivity-menu
              className="ds-popover absolute top-full right-0 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl p-3 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
              role="menu"
              aria-label={title}
            >
              <div className="flex items-start gap-2.5">
                <div className={`shrink-0 mt-0.5 ${isError ? 'text-red-500' : 'text-amber-500'}`}>
                  {isError ? <AlertTriangle size={18} /> : <Info size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--ds-text-primary)] leading-tight">{title}</p>
                  <p className="text-[11px] text-[var(--ds-text-secondary)] leading-snug mt-1">{detail}</p>
                  <div className="flex flex-col gap-1 mt-2.5">
                    <a
                      href="/settings/uploads/seeding-diagnostic"
                      className="inline-flex min-h-[44px] tv:min-h-[48px] items-center text-sm font-semibold text-[var(--ds-accent-violet)] hover:underline rounded-lg px-1"
                      onClick={() => setMenuOpen(false)}
                      data-focusable
                      tabIndex={0}
                      role="menuitem"
                    >
                      {t('connectivity.openDiagnostic')}
                    </a>
                    <a
                      href="/settings/notifications"
                      className="inline-flex min-h-[44px] tv:min-h-[48px] items-center text-sm font-semibold text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:underline rounded-lg px-1"
                      onClick={() => setMenuOpen(false)}
                      data-focusable
                      tabIndex={0}
                      role="menuitem"
                    >
                      {t('connectivity.openSettings')}
                    </a>
                    <a
                      href={accountHref}
                      className="inline-flex min-h-[44px] tv:min-h-[48px] items-center text-sm font-semibold text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:underline rounded-lg px-1"
                      onClick={() => setMenuOpen(false)}
                      data-focusable
                      tabIndex={0}
                      role="menuitem"
                    >
                      {resolvedAccountLabel}
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="shrink-0 p-1.5 min-h-[44px] min-w-[44px] rounded-lg text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-overlay)] hover:text-[var(--ds-text-primary)] transition-colors"
                  aria-label={t('connectivity.dismiss')}
                  data-focusable
                  tabIndex={0}
                  role="menuitem"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
