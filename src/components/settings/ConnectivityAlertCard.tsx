import { AlertTriangle, Info, X } from 'lucide-preact';
import { useSeedingHealth } from '../../hooks/useSeedingHealth';
import { useConnectivityAlert } from '../../hooks/useConnectivityAlert';
import { useI18n } from '../../lib/i18n/useI18n';

type Props = {
  /** Afficher le lien vers Paramètres → Notifications */
  showSettingsLink?: boolean;
  className?: string;
};

/**
 * Carte d’alerte partage BitTorrent (même source que la pastille avatar).
 * Affiche uniquement s’il y a un problème non masqué ; croix pour masquer.
 */
export default function ConnectivityAlertCard({
  showSettingsLink = true,
  className = '',
}: Props) {
  const { diagnostic, loading } = useSeedingHealth();
  const { t } = useI18n();
  const { hasIssue, dismiss } = useConnectivityAlert(diagnostic, loading);

  if (!hasIssue || !diagnostic) return null;

  const isError = diagnostic.status === 'error';
  const title = isError ? t('connectivity.errorTitle') : t('connectivity.warningTitle');
  const detail = diagnostic.warnings?.[0] || t('connectivity.defaultDetail');

  return (
    <section
      className={`relative rounded-xl border p-4 sm:p-5 ${
        isError
          ? 'border-red-500/30 bg-red-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
      } ${className}`}
      role="alert"
      aria-label={title}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        aria-label={t('connectivity.dismiss')}
      >
        <X size={18} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className={`shrink-0 mt-0.5 ${isError ? 'text-red-400' : 'text-amber-400'}`}>
          {isError ? <AlertTriangle size={22} /> : <Info size={22} />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm sm:text-base font-semibold text-white leading-tight">{title}</p>
          <p className="text-sm text-white/80 leading-snug">{detail}</p>
          {(diagnostic.warnings?.length ?? 0) > 1 && (
            <ul className="text-xs text-white/60 list-disc pl-4 space-y-0.5">
              {diagnostic.warnings.slice(1).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <a
              href="/settings/uploads/seeding-diagnostic"
              className="text-sm font-semibold text-[var(--ds-accent-violet)] hover:underline"
            >
              {t('connectivity.openDiagnostic')}
            </a>
            {showSettingsLink && (
              <a
                href="/settings/notifications"
                className="text-sm font-medium text-white/70 hover:text-white hover:underline"
              >
                {t('connectivity.openSettings')}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
