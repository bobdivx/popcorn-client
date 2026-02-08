/**
 * Service de notifications natives
 * Supporte à la fois Tauri (Android/Desktop) et les navigateurs web (Chrome, Firefox, etc.)
 * Wrapper autour de l'API Tauri notification avec gestion des permissions et canaux Android
 */

// Types pour les canaux Android
type NotificationChannel = 'sync' | 'updates' | 'general' | 'errors' | 'feedback';

interface NotificationOptions {
  title: string;
  body: string;
  channel?: NotificationChannel;
  tag?: string;
  ongoing?: boolean;
}

class NotificationService {
  private permissionGranted: boolean | null = null;
  private channelsInitialized = false;

  /**
   * Vérifie si on est en environnement Tauri
   */
  private async isTauriEnvironment(): Promise<boolean> {
    try {
      // Vérifier si l'API Tauri est disponible
      if (typeof window === 'undefined') return false;
      const { isTauri } = await import('../utils/tauri.js');
      return isTauri();
    } catch {
      return false;
    }
  }

  /**
   * Vérifie si les permissions de notification sont accordées
   */
  async checkPermission(): Promise<boolean> {
    try {
      const isTauri = await this.isTauriEnvironment();
      
      if (isTauri) {
        // Environnement Tauri
        const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
        this.permissionGranted = await isPermissionGranted();
        return this.permissionGranted;
      } else {
        // Environnement navigateur web
        if (typeof Notification === 'undefined') {
          console.warn('[NotificationService] API Notification non disponible dans ce navigateur');
          return false;
        }
        const permission = Notification.permission;
        this.permissionGranted = permission === 'granted';
        return this.permissionGranted;
      }
    } catch (error) {
      console.error('[NotificationService] Erreur lors de la vérification des permissions:', error);
      return false;
    }
  }

  /**
   * Demande les permissions de notification
   */
  async requestPermission(): Promise<boolean> {
    try {
      const isTauri = await this.isTauriEnvironment();
      
      if (isTauri) {
        // Environnement Tauri
        const { requestPermission } = await import('@tauri-apps/plugin-notification');
        const permission = await requestPermission();
        this.permissionGranted = permission === 'granted';
        return this.permissionGranted;
      } else {
        // Environnement navigateur web
        if (typeof Notification === 'undefined') {
          console.warn('[NotificationService] API Notification non disponible dans ce navigateur');
          return false;
        }
        
        // Vérifier si la permission est déjà accordée ou refusée
        if (Notification.permission === 'granted') {
          this.permissionGranted = true;
          return true;
        }
        if (Notification.permission === 'denied') {
          this.permissionGranted = false;
          console.warn('[NotificationService] Permissions de notification déjà refusées par l\'utilisateur');
          return false;
        }
        
        // Demander la permission (affichera la popup dans Chrome)
        // IMPORTANT: Cette méthode doit être appelée depuis une interaction utilisateur
        // (clic, touche, etc.) pour que Chrome affiche la popup de permission
        const permission = await Notification.requestPermission();
        this.permissionGranted = permission === 'granted';
        
        if (permission === 'granted') {
          console.log('[NotificationService] Permissions de notification accordées');
        } else if (permission === 'denied') {
          console.warn('[NotificationService] Permissions de notification refusées par l\'utilisateur');
        }
        
        return this.permissionGranted;
      }
    } catch (error) {
      console.error('[NotificationService] Erreur lors de la demande de permissions:', error);
      return false;
    }
  }

  /**
   * Initialise les canaux Android (appelé une fois au démarrage)
   */
  async initializeChannels(): Promise<void> {
    if (this.channelsInitialized) return;

    try {
      // Vérifier si on est en Tauri avant d'importer le plugin
      if (!(await this.isTauriEnvironment())) {
        this.channelsInitialized = true;
        return;
      }
      const { Channel, ChannelImportance } = await import('@tauri-apps/plugin-notification');
      
      // Canal pour la synchronisation (importance élevée)
      await Channel.create({
        id: 'sync',
        name: 'Synchronisation',
        description: 'Notifications de synchronisation des torrents',
        importance: ChannelImportance.High,
        sound: 'default',
        vibration: true,
      });

      // Canal pour les mises à jour (importance élevée)
      await Channel.create({
        id: 'updates',
        name: 'Mises à jour',
        description: 'Notifications de mises à jour disponibles',
        importance: ChannelImportance.High,
        sound: 'default',
        vibration: true,
      });

      // Canal pour les notifications générales (importance par défaut)
      await Channel.create({
        id: 'general',
        name: 'Général',
        description: 'Notifications générales',
        importance: ChannelImportance.Default,
        sound: 'default',
      });

      // Canal pour les erreurs (importance élevée)
      await Channel.create({
        id: 'errors',
        name: 'Erreurs',
        description: 'Notifications d\'erreurs',
        importance: ChannelImportance.High,
        sound: 'default',
        vibration: true,
      });

      // Canal pour le feedback (réponses admin)
      await Channel.create({
        id: 'feedback',
        name: 'Feedback',
        description: 'Réponses à vos retours',
        importance: ChannelImportance.Default,
        sound: 'default',
      });

      this.channelsInitialized = true;
      console.log('[NotificationService] Canaux Android initialisés');
    } catch (error) {
      console.error('[NotificationService] Erreur lors de l\'initialisation des canaux:', error);
      // Continue même si l'initialisation échoue (peut ne pas être disponible sur toutes les plateformes)
    }
  }

  /**
   * Envoie une notification native
   */
  async notify(options: NotificationOptions): Promise<void> {
    // Vérifier les permissions
    if (this.permissionGranted === null) {
      await this.checkPermission();
    }

    if (!this.permissionGranted) {
      // Essayer de demander la permission
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('[NotificationService] Permissions de notification refusées');
        return;
      }
    }

    try {
      const isTauri = await this.isTauriEnvironment();
      
      if (isTauri) {
        // Environnement Tauri
        // S'assurer que les canaux sont initialisés
        await this.initializeChannels();

        const channelId = options.channel || 'general';
        const { Notification } = await import('@tauri-apps/plugin-notification');
        
        await Notification.sendNotification({
          title: options.title,
          body: options.body,
          tag: options.tag,
          channel: channelId,
          // Sur Android, les notifications "ongoing" sont persistantes
          ...(options.ongoing && { ongoing: true }),
        });
      } else {
        // Environnement navigateur web
        if (typeof Notification === 'undefined') {
          console.warn('[NotificationService] API Notification non disponible dans ce navigateur');
          return;
        }
        
        // Utiliser l'API Web Notifications standard (Chrome, Firefox, etc.)
        const notification = new Notification(options.title, {
          body: options.body,
          tag: options.tag,
          icon: '/popcorn_logo.png', // Icône de notification
          requireInteraction: options.ongoing, // Pour les notifications persistantes (ne se ferment pas automatiquement)
          badge: '/popcorn_logo.png', // Badge pour les notifications (mobile)
        });
        
        // Gérer les événements de notification
        notification.onclick = () => {
          // Focus sur la fenêtre si elle existe
          if (window.focus) {
            window.focus();
          }
          // Fermer la notification au clic (surtout pour les notifications avec interaction requise)
          notification.close();
        };
        
        // Fermer automatiquement après 3 secondes UNIQUEMENT si ce n'est pas une notification avec interaction requise
        // Les notifications avec ongoing: true restent affichées jusqu'à interaction utilisateur
        if (!options.ongoing) {
          setTimeout(() => {
            try {
              notification.close();
            } catch (error) {
              // La notification peut déjà être fermée, ignorer l'erreur
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('[NotificationService] Erreur lors de l\'envoi de la notification:', error);
      // Fallback silencieux - ne pas bloquer l'application
    }
  }

  /**
   * Notification de démarrage de synchronisation
   */
  async notifySyncStart(): Promise<void> {
    await this.notify({
      title: 'Synchronisation démarrée',
      body: 'La synchronisation des torrents a commencé',
      channel: 'sync',
      tag: 'sync-start',
      ongoing: true,
    });
  }

  /**
   * Notification de progression de synchronisation
   */
  async notifySyncProgress(torrentsCount: number): Promise<void> {
    await this.notify({
      title: 'Synchronisation en cours',
      body: `${torrentsCount} nouveaux torrents synchronisés`,
      channel: 'sync',
      tag: 'sync-progress',
      ongoing: true,
    });
  }

  /**
   * Notification d'erreur de synchronisation
   */
  async notifySyncError(message: string): Promise<void> {
    await this.notify({
      title: 'Erreur de synchronisation',
      body: message,
      channel: 'errors',
      tag: 'sync-error',
    });
  }

  /**
   * Notification de complétion de synchronisation
   */
  async notifySyncComplete(torrentsAdded: number): Promise<void> {
    await this.notify({
      title: 'Synchronisation terminée',
      body: `${torrentsAdded} torrents ajoutés`,
      channel: 'sync',
      tag: 'sync-complete',
    });
  }

  /**
   * Notification de mise à jour disponible
   */
  async notifyUpdateAvailable(version: string, downloadUrl?: string): Promise<void> {
    await this.notify({
      title: 'Mise à jour disponible',
      body: `Version ${version} disponible${downloadUrl ? '. Téléchargez-la maintenant.' : ''}`,
      channel: 'updates',
      tag: 'update-available',
    });
  }

  /**
   * Notification d'erreur générale
   */
  async notifyError(title: string, message: string): Promise<void> {
    await this.notify({
      title,
      body: message,
      channel: 'errors',
      tag: `error-${Date.now()}`,
    });
  }

  /**
   * Notification de succès
   */
  async notifySuccess(title: string, message: string): Promise<void> {
    await this.notify({
      title,
      body: message,
      channel: 'general',
      tag: `success-${Date.now()}`,
    });
  }
}

// Instance singleton
export const notificationService = new NotificationService();

// Initialisation au chargement du module
if (typeof window !== 'undefined') {
  // Initialiser les canaux au démarrage (de manière asynchrone pour ne pas bloquer)
  notificationService.initializeChannels().catch((error) => {
    console.error('[NotificationService] Erreur lors de l\'initialisation:', error);
  });
}
