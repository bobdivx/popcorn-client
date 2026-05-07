import { useI18n } from '../../../lib/i18n/useI18n';
import type { ClientTorrentStats } from '../../../lib/client/types';

export interface TorrentStatusBadgeProps {
  state: ClientTorrentStats['state'];
  className?: string;
  /**
   * État « Partage » avec upload ou pairs : halo animé (page Téléchargements, fiche détail).
   * Laissez vide/faux pour le halo statique seulement quand `state === 'seeding'`.
   */
  seedingActive?: boolean;
}

const stateColors: Record<ClientTorrentStats['state'], string> = {
  queued: 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-secondary)]',
  downloading: 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]',
  seeding: 'bg-[var(--ds-accent-green)] text-[var(--ds-text-on-accent)]',
  paused: 'bg-[var(--ds-accent-yellow)] text-[var(--ds-text-on-accent)]',
  completed: 'bg-[var(--ds-accent-green)] text-[var(--ds-text-on-accent)]',
  error: 'bg-[var(--ds-accent-red)] text-white',
};

export function TorrentStatusBadge({
  state,
  className = '',
  seedingActive = false,
}: TorrentStatusBadgeProps) {
  const { t } = useI18n();
  const key = `downloads.states.${state}`;
  const label = t(key) || state;
  const colorClass = stateColors[state] ?? 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-secondary)]';

  const seedingHighlight =
    state === 'seeding'
      ? seedingActive
        ? 'ring-2 ring-[var(--ds-accent-green)] shadow-[0_0_12px_rgba(52,211,153,0.55)] motion-safe:animate-pulse'
        : 'ring-2 ring-[var(--ds-accent-green)]/70'
      : '';

  return (
    <span
      className={`inline-flex items-center px-4 py-2 rounded-[var(--ds-radius-sm)] text-sm font-semibold ${colorClass} ${seedingHighlight} ${className}`}
      role="status"
      title={
        state === 'seeding' && seedingActive
          ? t('downloads.seedingBadgeActiveTitle')
          : state === 'seeding'
            ? t('downloads.seedingBadgeIdleTitle')
            : undefined
      }
    >
      {label}
    </span>
  );
}
