/**
 * Utilitaires de formatage pour tailles, vitesses et durées.
 * Utilisés par les composants torrent (barre de progression, stats, etc.)
 */

/**
 * Formate un nombre d'octets en chaîne lisible (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Formate une vitesse en octets/s en chaîne lisible (ex: "1.5 MB/s").
 */
export function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

/**
 * Formate un temps restant en secondes en chaîne "h:mm:ss" ou "m:ss".
 * Retourne "--:--" si seconds est null, undefined, ou <= 0.
 */
export function formatTimeRemaining(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0 || isNaN(seconds)) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formate une durée en secondes pour affichage court (ex: "45s", "3m", "2h").
 */
export function formatETA(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}
