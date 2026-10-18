import BackendStatusBadge from '../layout/BackendStatusBadge';
import GpuStatusBadge from '../layout/GpuStatusBadge';
import { useI18n } from '../../lib/i18n/useI18n';

/**
 * Statut serveur + accélération GPU (déplacé du header vers Paramètres → Serveur).
 * Contient l'état en ligne / hors ligne, l'URL, les versions serveur/client, les commandes
 * Démarrer/Arrêter/Redémarrer (Tauri desktop uniquement) et le mode d'encodage (GPU / CPU).
 */
export default function ServerStatusCard() {
  const { language } = useI18n();
  const en = language === 'en';
  return (
    <section
      className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)]/40 overflow-hidden"
      aria-label={en ? 'Server and GPU status' : 'Statut du serveur et du GPU'}
      data-server-status-card
    >
      <BackendStatusBadge variant="inline" />
      <div className="border-t border-[var(--ds-border)]" aria-hidden />
      <GpuStatusBadge variant="inline" />
    </section>
  );
}
