import { useSeedingHealth } from '../../hooks/useSeedingHealth';
import { AlertTriangle, Info, X } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';

export default function ConnectivityWarning() {
  const { diagnostic, loading } = useSeedingHealth();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);

  // Re-show if status changes to error/warning
  useEffect(() => {
    if (diagnostic?.status && diagnostic.status !== 'ok') {
      setDismissed(false);
    }
  }, [diagnostic?.status]);

  if (loading || !diagnostic || diagnostic.status === 'ok' || dismissed) {
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
        onClick={() => setDismissed(true)}
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
