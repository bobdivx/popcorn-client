import { useEffect, useRef, useState } from 'preact/hooks';
import { Info, CheckCircle2, AlertTriangle, XCircle, X, Upload } from 'lucide-preact';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  duration?: number; // ms, 0 = permanent
  onClose?: () => void;
}

const typeConfig: Record<NotificationType, { bar: string; icon: string }> = {
  info:    { bar: 'bg-blue-400',   icon: 'text-blue-400' },
  success: { bar: 'bg-green-400',  icon: 'text-green-400' },
  warning: { bar: 'bg-yellow-400', icon: 'text-yellow-400' },
  error:   { bar: 'bg-red-400',    icon: 'text-red-400' },
};

const icons = {
  info:    <Info class="shrink-0 w-4 h-4" size={16} />,
  success: <CheckCircle2 class="shrink-0 w-4 h-4" size={16} />,
  warning: <AlertTriangle class="shrink-0 w-4 h-4" size={16} />,
  error:   <XCircle class="shrink-0 w-4 h-4" size={16} />,
};

export default function Notification({ type, message, duration = 5000, onClose }: NotificationProps) {
  const [show, setShow] = useState(false);
  // Stocker onClose dans une ref pour ne pas redéclencher les effets à chaque rendu
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Animation d'entrée
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Auto-fermeture — ne dépend que de `duration`, pas de `onClose`
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(handleClose, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  function handleClose() {
    setShow(false);
    setTimeout(() => onCloseRef.current?.(), 300);
  }

  const config = typeConfig[type];

  return (
    <div
      class={`relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl overflow-hidden
        bg-[rgba(28,28,30,0.96)] backdrop-blur-xl border border-white/10 shadow-xl
        transition-all duration-300 ease-out
        ${show ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5'}`}
    >
      {/* Barre colorée à gauche */}
      <div class={`absolute left-0 inset-y-0 w-[3px] ${config.bar}`} />

      <span class={`flex-shrink-0 ${config.icon}`}>
        {icons[type]}
      </span>

      <span class="flex-1 text-xs font-medium text-white/85 leading-relaxed">{message}</span>

      {onClose && (
        <button
          class="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors p-1 rounded-lg hover:bg-white/8"
          onClick={handleClose}
          aria-label="Fermer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export interface SeedingStatusInfo {
  uploadSpeed: number;   // bytes/s
  peersConnected: number;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 Ko/s';
  if (bytesPerSec < 1024) return `${bytesPerSec} o/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} Ko/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} Mo/s`;
}

function SeedingStatusItem({ info }: { info: SeedingStatusInfo }) {
  return (
    <div class="relative flex items-center gap-3 pl-4 pr-3.5 py-2.5 rounded-xl overflow-hidden bg-[rgba(28,28,30,0.96)] backdrop-blur-xl border border-white/10 shadow-xl">
      <div class="absolute left-0 inset-y-0 w-[3px] bg-green-400" />
      <span class="flex-shrink-0 text-green-400">
        <Upload size={14} class="shrink-0 w-3.5 h-3.5" />
      </span>
      <span class="text-xs font-semibold text-green-400">Partage actif</span>
      <div class="w-px h-3 bg-white/15 flex-shrink-0" />
      <span class="text-xs text-white/60">{formatSpeed(info.uploadSpeed)}</span>
      <div class="w-px h-3 bg-white/15 flex-shrink-0" />
      <span class="text-xs text-white/60">{info.peersConnected} pair(s)</span>
    </div>
  );
}

/**
 * Conteneur unifié : statut de partage persistant + notifications éphémères
 */
export interface NotificationContainerProps {
  notifications: Array<{
    id: string;
    type: NotificationType;
    message: string;
    duration?: number;
  }>;
  onRemove: (id: string) => void;
  seedingStatus?: SeedingStatusInfo | null;
}

export function NotificationContainer({ notifications, onRemove, seedingStatus }: NotificationContainerProps) {
  if (notifications.length === 0 && !seedingStatus) {
    return null;
  }

  return (
    <div class="fixed bottom-4 right-4 z-[9999] max-w-xs w-full space-y-2 pointer-events-none">
      {seedingStatus && (
        <div class="pointer-events-auto">
          <SeedingStatusItem info={seedingStatus} />
        </div>
      )}
      {notifications.map((notification) => (
        <div key={notification.id} class="pointer-events-auto">
          <Notification
            type={notification.type}
            message={notification.message}
            duration={notification.duration}
            onClose={() => onRemove(notification.id)}
          />
        </div>
      ))}
    </div>
  );
}
