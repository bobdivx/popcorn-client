import { useState, useCallback } from 'preact/hooks';
import { randomUUID } from '../../../../lib/utils/uuid';
import type { NotificationType } from '../../../ui/Notification';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Array<{ id: string; type: NotificationType; message: string; duration?: number }>>([]);

  const addNotification = useCallback((type: NotificationType, message: string, duration?: number) => {
    const id = `${Date.now()}-${randomUUID()}`;
    setNotifications((prev) => [...prev, { id, type, message, duration }]);
    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
  };
}
