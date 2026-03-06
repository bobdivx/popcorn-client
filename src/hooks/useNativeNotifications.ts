/**
 * Hook Preact pour utiliser les notifications natives Android
 * Facilite l'utilisation des notifications dans les composants
 */

import { useState, useEffect, useCallback } from 'preact/hooks';
import { notificationService } from '../lib/services/notification-service.js';

type PermissionStatus = 'granted' | 'denied' | 'pending' | 'unknown';

interface UseNativeNotificationsReturn {
  permissionStatus: PermissionStatus;
  requestPermission: () => Promise<boolean>;
  notifySyncStart: () => Promise<void>;
  notifySyncProgress: (count: number) => Promise<void>;
  notifySyncError: (message: string) => Promise<void>;
  notifySyncComplete: (count: number) => Promise<void>;
  notifyUpdateAvailable: (version: string, downloadUrl?: string) => Promise<void>;
  notifyError: (title: string, message: string) => Promise<void>;
  notifySuccess: (title: string, message: string) => Promise<void>;
}

/**
 * Hook pour utiliser les notifications natives dans les composants Preact
 */
export function useNativeNotifications(): UseNativeNotificationsReturn {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');

  // Vérifier les permissions au montage du composant
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const granted = await notificationService.checkPermission();
        setPermissionStatus(granted ? 'granted' : 'denied');
      } catch (error) {
        console.error('[useNativeNotifications] Erreur lors de la vérification des permissions:', error);
        setPermissionStatus('unknown');
      }
    };

    checkPermission();
  }, []);

  // Demander les permissions
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setPermissionStatus('pending');
    try {
      const granted = await notificationService.requestPermission();
      setPermissionStatus(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.error('[useNativeNotifications] Erreur lors de la demande de permissions:', error);
      setPermissionStatus('denied');
      return false;
    }
  }, []);

  // Méthodes de notification
  const notifySyncStart = useCallback(async () => {
    await notificationService.notifySyncStart();
  }, []);

  const notifySyncProgress = useCallback(async (count: number) => {
    await notificationService.notifySyncProgress(count);
  }, []);

  const notifySyncError = useCallback(async (message: string) => {
    await notificationService.notifySyncError(message);
  }, []);

  const notifySyncComplete = useCallback(async (count: number) => {
    await notificationService.notifySyncComplete(count);
  }, []);

  const notifyUpdateAvailable = useCallback(async (version: string, downloadUrl?: string) => {
    await notificationService.notifyUpdateAvailable(version, downloadUrl);
  }, []);

  const notifyError = useCallback(async (title: string, message: string) => {
    await notificationService.notifyError(title, message);
  }, []);

  const notifySuccess = useCallback(async (title: string, message: string) => {
    await notificationService.notifySuccess(title, message);
  }, []);

  return {
    permissionStatus,
    requestPermission,
    notifySyncStart,
    notifySyncProgress,
    notifySyncError,
    notifySyncComplete,
    notifyUpdateAvailable,
    notifyError,
    notifySuccess,
  };
}
