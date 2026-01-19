/**
 * Service de vérification des mises à jour
 * Vérifie au démarrage si une nouvelle version est disponible
 */

import { notificationService } from './notification-service.js';

interface VersionInfo {
  version: string;
  downloadUrl?: string;
}

class UpdateChecker {
  private currentVersion: string | null = null;
  private checkInProgress = false;

  /**
   * Initialise le vérificateur avec la version actuelle
   */
  async initialize(): Promise<void> {
    try {
      // Récupérer la version depuis le fichier VERSION.json ou la config Tauri
      const response = await fetch('/VERSION.json');
      if (response.ok) {
        const data = await response.json();
        this.currentVersion = data.version || data.VERSION || null;
      }
    } catch (error) {
      console.warn('[UpdateChecker] Impossible de charger VERSION.json, utilisation de la version Tauri');
      // Fallback : essayer de récupérer depuis la config Tauri
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        this.currentVersion = await getVersion();
      } catch (e) {
        console.error('[UpdateChecker] Impossible de récupérer la version:', e);
      }
    }
  }

  /**
   * Parse la page de téléchargements pour extraire les versions disponibles
   */
  private async parseDownloadsPage(): Promise<VersionInfo | null> {
    try {
      const downloadsUrl = 'https://popcorn-web-five.vercel.app/downloads';
      const response = await fetch(downloadsUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      
      // Chercher les versions dans le HTML (format attendu: v1.0.X ou version dans les liens APK)
      const versionRegex = /(?:v|version[:\s]+)(\d+\.\d+\.\d+)/gi;
      const matches = html.match(versionRegex);
      
      if (!matches || matches.length === 0) {
        return null;
      }

      // Extraire la version la plus récente (première occurrence généralement)
      const latestVersion = matches[0].replace(/[^\d.]/g, '');
      
      // Chercher un lien de téléchargement APK
      const apkLinkRegex = /href=["']([^"']*\.apk[^"']*)["']/i;
      const apkMatch = html.match(apkLinkRegex);
      const downloadUrl = apkMatch ? apkMatch[1] : undefined;

      return {
        version: latestVersion,
        downloadUrl: downloadUrl ? (downloadUrl.startsWith('http') ? downloadUrl : `${downloadsUrl}${downloadUrl}`) : undefined,
      };
    } catch (error) {
      console.error('[UpdateChecker] Erreur lors du parsing de la page de téléchargements:', error);
      return null;
    }
  }

  /**
   * Compare deux versions (format: X.Y.Z)
   * Retourne: 1 si version1 > version2, -1 si version1 < version2, 0 si égales
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }

  /**
   * Vérifie si une mise à jour est disponible
   */
  async checkForUpdate(): Promise<VersionInfo | null> {
    if (this.checkInProgress) {
      console.log('[UpdateChecker] Vérification déjà en cours');
      return null;
    }

    if (!this.currentVersion) {
      await this.initialize();
    }

    if (!this.currentVersion) {
      console.warn('[UpdateChecker] Version actuelle inconnue, impossible de vérifier les mises à jour');
      return null;
    }

    this.checkInProgress = true;

    try {
      const latestVersionInfo = await this.parseDownloadsPage();

      if (!latestVersionInfo) {
        console.log('[UpdateChecker] Aucune version trouvée sur la page de téléchargements');
        return null;
      }

      const comparison = this.compareVersions(latestVersionInfo.version, this.currentVersion);

      if (comparison > 0) {
        console.log(`[UpdateChecker] Nouvelle version disponible: ${latestVersionInfo.version} (actuelle: ${this.currentVersion})`);
        return latestVersionInfo;
      } else {
        console.log(`[UpdateChecker] Version à jour: ${this.currentVersion}`);
        return null;
      }
    } catch (error) {
      console.error('[UpdateChecker] Erreur lors de la vérification des mises à jour:', error);
      return null;
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Vérifie les mises à jour et envoie une notification si disponible
   * Appelé au démarrage de l'application
   */
  async checkAndNotify(): Promise<void> {
    try {
      const updateInfo = await this.checkForUpdate();
      
      if (updateInfo) {
        await notificationService.notifyUpdateAvailable(
          updateInfo.version,
          updateInfo.downloadUrl
        );
      }
    } catch (error) {
      // Ne pas bloquer le démarrage en cas d'erreur
      console.error('[UpdateChecker] Erreur lors de la vérification des mises à jour:', error);
    }
  }
}

// Instance singleton
export const updateChecker = new UpdateChecker();

// Initialisation au chargement du module
if (typeof window !== 'undefined') {
  // Initialiser de manière asynchrone
  updateChecker.initialize().catch((error) => {
    console.error('[UpdateChecker] Erreur lors de l\'initialisation:', error);
  });
}
