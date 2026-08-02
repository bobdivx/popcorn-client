/**
 * Service de vérification des mises à jour
 * Vérifie au démarrage si une nouvelle version est disponible
 */

import { getPopcornWebApiUrl } from '../api/popcorn-web.js';
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
    // Essayer de charger depuis VERSION.json
    // Sur webOS (file://), /VERSION.json pointe vers la racine du système → utiliser chemin relatif
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
    const versionUrl = isFileProtocol ? './VERSION.json' : '/VERSION.json';
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        const data = await response.json();
        // Structure: { client: { version: "...", build: ... }, server: { ... } }
        this.currentVersion = data.client?.version || data.version || data.VERSION || null;
        if (this.currentVersion) {
          return;
        }
      }
    } catch (error) {
      console.warn('[UpdateChecker] Impossible de charger /VERSION.json:', error);
    }

    // Fallback : essayer de récupérer depuis la config Tauri
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      this.currentVersion = await getVersion();
      if (this.currentVersion) {
        return;
      }
    } catch (_e) {
      // Ce n'est pas une erreur si on n'est pas dans un environnement Tauri
    }

    // Si aucune méthode n'a fonctionné
    if (!this.currentVersion) {
      console.warn('[UpdateChecker] Version actuelle inconnue - VERSION.json doit être dans public/');
    }
  }

  /**
   * Vérifie si on est en environnement de développement
   */
  private isDevelopment(): boolean {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' ||
           hostname.includes('localhost') ||
           hostname.includes('192.168.') ||
           hostname.includes('10.') ||
           hostname.includes('172.');
  }

  /**
   * Récupère la dernière version via l'API JSON popcorn-web (CORS OK),
   * au lieu de scraper la page HTML /downloads (bloquée en cross-origin).
   */
  private async fetchLatestFromReleasesApi(): Promise<VersionInfo | null> {
    if (this.isDevelopment()) {
      return null;
    }

    try {
      const apiUrl = `${getPopcornWebApiUrl()}/downloads/releases?limit=10`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      // API: { success, data: ReleaseInfo[] }
      const releases = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.data?.releases)
          ? data.data.releases
          : Array.isArray(data?.releases)
            ? data.releases
            : [];
      if (!Array.isArray(releases) || releases.length === 0) {
        return null;
      }

      for (const release of releases) {
        const tag = String(release.tag || release.tag_name || release.name || '');
        const match = tag.match(/1\.\d+\.\d+/);
        if (!match) continue;
        const apks = Array.isArray(release.apks) ? release.apks : [];
        const apk = apks.find((a: { type?: string; downloadUrl?: string }) => a?.downloadUrl) || apks[0];
        return {
          version: match[0],
          downloadUrl: apk?.downloadUrl,
        };
      }
      return null;
    } catch {
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
      const latestVersionInfo = await this.fetchLatestFromReleasesApi();

      if (!latestVersionInfo) {
        return null;
      }

      const comparison = this.compareVersions(latestVersionInfo.version, this.currentVersion);

      if (comparison > 0) {
        return latestVersionInfo;
      } else {
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
