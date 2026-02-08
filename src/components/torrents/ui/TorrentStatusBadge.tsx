import { useI18n } from '../../../lib/i18n/useI18n';
import type { ClientTorrentStats } from '../../../lib/client/types';

export interface TorrentStatusBadgeProps {
  state: ClientTorrentStats['state'];
  className?: string;
}

const stateColors: Record<ClientTorrentStats['state'], string> = {
  queued: 'bg-gray-800 text-gray-300',
  downloading: 'bg-blue-600 text-white',
  seeding: 'bg-green-600 text-white',
  paused: 'bg-yellow-600 text-white',
  completed: 'bg-green-700 text-white',
  error: 'bg-red-600 text-white',
};

export function TorrentStatusBadge({ state, className = '' }: TorrentStatusBadgeProps) {
  const { t } = useI18n();
  const key = `downloads.states.${state}`;
  const label = t(key) || state;
  const colorClass = stateColors[state] ?? 'bg-gray-800 text-gray-300';

  return (
    <span
      className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold ${colorClass} ${className}`}
      role="status"
    >
      {label}
    </span>
  );
}
