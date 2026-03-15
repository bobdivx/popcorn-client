import { useState, useCallback } from 'preact/hooks';
import type { NotificationType } from '../../../ui/Notification';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Array<{ id: string; type: NotificationType; message: string; duration?: number }>>([]);

  const addNotification = useCallback((type: NotificationType, message: string, duration?: number) => {
    let randomPart: string;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      randomPart = window.crypto.randomUUID().split('-')[0];
    } else {
      const array = new Uint32Array(1);
      if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(array);
      }
      randomPart = array[0].toString(36);
    }
    const id = `${Date.now()}-${randomPart}`;
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
