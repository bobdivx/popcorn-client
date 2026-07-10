import { useSeedingHealth, type SeedingDiagnostic } from '../../hooks/useSeedingHealth';
import { AlertTriangle, Info, X } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
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

export default function ConnectivityWarning() {
  const { diagnostic, loading } = useSeedingHealth();
  const { t } = useI18n();
  const prevStatusRef = useRef<SeedingDiagnostic['status'] | undefined>();
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(() => readDismissedFingerprint());

  const fingerprint =
    diagnostic && diagnostic.status !== 'ok' ? warningFingerprint(diagnostic) : '';

  // Réafficher seulement si le problème était résolu (ok) puis réapparaît, ou si l'alerte change.
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

  const handleDismiss = () => {
    if (!fingerprint) return;
    setDismissedFingerprint(fingerprint);
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, fingerprint);
    } catch {
      /* ignore */
    }
  };

  if (loading || !diagnostic || diagnostic.status === 'ok' || isDismissed) {
    return null;
  }

  const isError = diagnostic.status === 'error';
  const colorClass = isError ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  const iconColor = isError ? 'text-red-500' : 'text-amber-500';

  return (
    <div 
      className={`fixed bottom-4 right-4 z-[10000] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm pointer-events-auto ${colorClass}`}
      style={{
        marginBottom: 'var(--safe-area-inset-bottom)',
        marginRight: 'var(--safe-area-inset-right)',
      }}
    >
      <div className={`shrink-0 ${iconColor}`}>
        {isError ? <AlertTriangle size={20} /> : <Info size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-tight">
          {isError ? 'Erreur de connexion BitTorrent' : 'Problème de partage détecté'}
        </p>
        <p className="text-[10px] opacity-90 leading-normal mt-0.5">
          {diagnostic.warnings?.[0] || 'Vérifiez la configuration de vos ports.'}
        </p>
      </div>
      <button 
        onClick={handleDismiss}
        className="shrink-0 p-2.5 hover:bg-white/10 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 active:scale-95"
        aria-label="Fermer la notification"
        tabIndex={0}
        data-focusable
        data-autofocus-priority="low"
      >
        <X size={20} />
      </button>
    </div>
  );
}
