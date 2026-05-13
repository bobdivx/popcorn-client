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
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${colorClass}`}>
      <div className={`shrink-0 ${iconColor}`}>
        {isError ? <AlertTriangle size={18} /> : <Info size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold leading-tight">
          {isError ? 'Erreur de connexion BitTorrent' : 'Problème de partage détecté'}
        </p>
        <p className="text-[10px] opacity-80 truncate">
          {diagnostic.warnings?.[0] || 'Vérifiez la configuration de vos ports.'}
        </p>
      </div>
      <button 
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Ignorer"
      >
        <X size={14} />
      </button>
    </div>
  );
}
