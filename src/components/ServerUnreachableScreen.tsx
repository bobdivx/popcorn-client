import { useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../lib/i18n/useI18n';

export interface ServerUnreachableScreenProps {
  /** URL serveur enregistrée qui ne répond pas (affichée pour diagnostic). */
  backendUrl: string;
  /** Nouvelle vérification en cours (désactive « Réessayer »). */
  retrying?: boolean;
  onRetry: () => void;
  onChangeServer: () => void;
}

/**
 * Écran « Serveur injoignable » (démarrage) : le serveur enregistré ne répond pas
 * (réseau, CORS, délai dépassé ou 5xx). Rien n'est effacé tant que l'utilisateur ne choisit pas
 * « Changer de serveur » : une simple coupure se règle avec « Réessayer ».
 */
export default function ServerUnreachableScreen({
  backendUrl,
  retrying = false,
  onRetry,
  onChangeServer,
}: ServerUnreachableScreenProps) {
  const { t } = useI18n();
  const retryRef = useRef<HTMLButtonElement>(null);

  // Focus initial (télécommande TV / clavier).
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center px-6 overflow-y-auto"
      style={{ background: '#0c0d10', color: '#f4f1ec' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-unreachable-title"
      aria-describedby="server-unreachable-desc"
      data-server-unreachable
    >
      <div className="ds-card w-full max-w-md p-6 sm:p-8 text-center flex flex-col items-center gap-4">
        <h1 id="server-unreachable-title" className="text-xl sm:text-2xl font-semibold">
          {t('serverUnreachable.title')}
        </h1>
        <p id="server-unreachable-desc" className="text-sm text-white/70">
          {t('serverUnreachable.description')}
        </p>
        {backendUrl ? (
          <p className="text-xs text-white/50 break-all" title={backendUrl}>
            {t('serverUnreachable.serverLabel')} <span className="text-white/80">{backendUrl}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2 w-full">
          <button
            ref={retryRef}
            type="button"
            className="btn btn-primary"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying ? 'true' : undefined}
          >
            {retrying ? t('serverUnreachable.retrying') : t('serverUnreachable.retry')}
          </button>
          <button type="button" className="btn btn-outline" onClick={onChangeServer} disabled={retrying}>
            {t('serverUnreachable.changeServer')}
          </button>
        </div>
        <p className="text-xs text-white/50">{t('serverUnreachable.changeServerHint')}</p>
      </div>
    </div>
  );
}
