import { Users } from 'lucide-preact';
import { useI18n } from '../../../lib/i18n/useI18n';

export interface PeersIndicatorProps {
  peersConnected?: number;
  className?: string;
}

export function PeersIndicator({ peersConnected, className = '' }: PeersIndicatorProps) {
  const { t } = useI18n();

  if (peersConnected == null || peersConnected < 0) {
    return null;
  }

  const label = t('torrentStats.peers', { count: peersConnected }) ?? `${peersConnected} peer${peersConnected > 1 ? 's' : ''}`;

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <Users className="size-4 text-white/60 shrink-0" size={16} aria-hidden />
      {label}
    </span>
  );
}
