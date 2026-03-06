import { useEffect, useState } from 'preact/hooks';
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-preact';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  duration?: number; // Durée en millisecondes, 0 = permanent
  onClose?: () => void;
}

export default function Notification({ type, message, duration = 5000, onClose }: NotificationProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onClose?.(), 300); // Attendre la fin de l'animation
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!visible) {
    return null;
  }

  // Classes personnalisées pour s'intégrer au design Netflix (fond sombre avec transparence)
  const typeClasses = {
    info: 'bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/30',
    success: 'bg-green-500/80 backdrop-blur-md text-white border border-green-400/30',
    warning: 'bg-yellow-500/80 backdrop-blur-md text-white border border-yellow-400/30',
    error: 'bg-red-500/80 backdrop-blur-md text-white border border-red-400/30',
  };

  const icons = {
    info: <Info class="stroke-current shrink-0 w-6 h-6" size={24} />,
    success: <CheckCircle2 class="stroke-current shrink-0 h-6 w-6" size={24} />,
    warning: <AlertTriangle class="stroke-current shrink-0 h-6 w-6" size={24} />,
    error: <XCircle class="stroke-current shrink-0 h-6 w-6" size={24} />,
  };

  return (
    <div class={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border shadow-2xl transition-all duration-300 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'} ${typeClasses[type]}`}>
      <div class="flex-shrink-0 w-4 h-4 mt-0.5">
        {icons[type]}
      </div>
      <span class="flex-1 text-xs font-normal leading-relaxed pr-1">{message}</span>
      {onClose && (
        <button 
          class="flex-shrink-0 text-white/50 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10 -mt-0.5" 
          onClick={() => { setVisible(false); setTimeout(() => onClose(), 300); }}
          aria-label="Fermer"
        >
          <X class="h-3.5 w-3.5" size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Composant conteneur pour afficher plusieurs notifications
 */
export interface NotificationContainerProps {
  notifications: Array<{
    id: string;
    type: NotificationType;
    message: string;
    duration?: number;
  }>;
  onRemove: (id: string) => void;
}

export function NotificationContainer({ notifications, onRemove }: NotificationContainerProps) {
  if (notifications.length === 0) {
    return null;
  }

  // Positionner sous la navbar (h-16 = 64px + padding = ~80px)
  // Utiliser un positionnement fixe mais mieux intégré au design Netflix
  return (
    <div class="fixed top-20 right-4 z-[9999] max-w-xs w-full space-y-2 pointer-events-none">
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
