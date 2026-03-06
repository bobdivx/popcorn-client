/**
 * Politique de source : URL du backend et capacité seek (dérivée du type de source).
 */

export interface SourcePolicy {
  /** URL du backend de stream (ex. serveur ami). */
  baseUrl: string;
  /** Désactivé pour local_, UNC, ami (évite 503 en boucle). */
  canUseSeekReload: boolean;
}
