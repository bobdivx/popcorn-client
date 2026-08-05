import { useSeedingHealth, type SeedingDiagnostic } from '../../hooks/useSeedingHealth';
import { AlertTriangle, Info, X } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';

const DISMISS_STORAGE_KEY = 'popcorn_connectivity_warning_dismissed';

function warningFingerprint(diagnostic: SeedingDiagnostic): string {
  return `${diagnostic.status}|${(diagnostic.warnings ?? []).join('\u0000')}`;
}

function readDismissedFingerprint(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

type Props = {
  /** Avatar (ou autre trigger) sur lequel afficher la pastille de notif. */
  children: ComponentChildren;
  className?: string;
};

/**
 * Affiche une pastille de notification sur l'avatar du header
 * lorsqu'un problème de partage BitTorrent est détecté (plus de carte flottante).
 */
export default function ConnectivityWarning({ children, className = '' }: Props) {
  const { diagnostic, loading } = useSeedingHealth();
  const { t } = useI18n();
  const prevStatusRef = useRef<SeedingDiagnostic['status'] | undefined>();
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(() =>
    readDismissedFingerprint()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const fingerprint =
    diagnostic && diagnostic.status !== 'ok' ? warningFingerprint(diagnostic) : '';

  useEffect(() => {
    if (!diagnostic) return;

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = diagnostic.status;

    if (prevStatus === 'ok' && diagnostic.status !== 'ok') {
      setDismissedFingerprint(null);
      try {
        sessionStorage.removeItem(DISMISS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    if (!fingerprint) return;

    const stored = readDismissedFingerprint();
    if (stored && stored !== fingerprint) {
      setDismissedFingerprint(null);
      try {
        sessionStorage.removeItem(DISMISS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
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

  const handleDismiss = () => {
    if (!fingerprint) return;
    setDismissedFingerprint(fingerprint);
    setMenuOpen(false);
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, fingerprint);
    } catch {
      /* ignore */
    }
  };

  const isError = diagnostic?.status === 'error';
  const badgeClass = isError ? 'bg-red-500' : 'bg-amber-500';
  const title = isError
    ? t('connectivity.errorTitle')
    : t('connectivity.warningTitle');
  const detail =
    diagnostic?.warnings?.[0] || t('connectivity.defaultDetail');

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      {children}
      {hasIssue && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
            className={`absolute -top-0.5 -right-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full ${badgeClass} text-[9px] font-bold text-white shadow-md ring-2 ring-[var(--ds-surface-elevated,#0a0a0a)] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-violet)]`}
            aria-label={title}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            title={title}
            data-focusable
          >
            {isError ? '!' : '1'}
          </button>
          {menuOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-72 max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-white/15 bg-gray-900/95 shadow-xl backdrop-blur-xl p-3 z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
              role="dialog"
              aria-label={title}
            >
              <div className="flex items-start gap-2.5">
                <div className={`shrink-0 mt-0.5 ${isError ? 'text-red-400' : 'text-amber-400'}`}>
                  {isError ? <AlertTriangle size={18} /> : <Info size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white leading-tight">{title}</p>
                  <p className="text-[11px] text-white/75 leading-snug mt-1">{detail}</p>
                  <a
                    href="/settings/uploads/seeding-diagnostic"
                    className="inline-flex mt-2.5 text-[11px] font-semibold text-[var(--ds-accent-violet)] hover:underline"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t('connectivity.openDiagnostic')}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="shrink-0 p-1.5 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label={t('connectivity.dismiss')}
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
