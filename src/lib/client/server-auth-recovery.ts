/**
 * Récupération d'une session serveur inutilisable (401 du serveur Popcornn).
 *
 * Le serveur n'accepte que le token cloud / Pocket ID ou une session `pls1.` qu'il a lui-même
 * délivrée (TokenManager.getServerAuthToken). Le JWT local auto-signé (`access_token`) n'est pas
 * vérifiable côté serveur, mais c'est lui que `isAuthenticated()` regarde : si le token cloud a
 * disparu (refresh cloud expiré, nettoyage partiel du stockage, changement d'URL serveur) sans
 * session `pls1.`, le client se croit connecté et reste sur le dashboard en boucle de 401
 * « Authorization Bearer requis » sans jamais proposer la connexion.
 */

export interface Unauthorized401Context {
  status: number;
  /** Appel de connexion / inscription : un 401 y signifie « identifiants invalides ». */
  isAuthBootstrap: boolean;
  /** Token cloud encore présent après la tentative de refresh. */
  hasCloudToken: boolean;
  /** Session `pls1.` (utilisateur local / compte serveur) présente. */
  hasServerSession: boolean;
}

/**
 * Faut-il forcer une reconnexion (événement `popcorn:session-expired` → /login) ?
 * Oui pour tout 401 hors connexion quand plus aucun token cloud n'est disponible :
 * - session `pls1.` expirée ou révoquée ;
 * - aucune identité vérifiable par le serveur (seul le JWT local reste, ou rien).
 * Avec un token cloud encore présent (refresh réseau/5xx en échec), on ne force rien.
 */
export function shouldForceReloginOn401(ctx: Unauthorized401Context): boolean {
  if (ctx.status !== 401 || ctx.isAuthBootstrap) return false;
  if (ctx.hasCloudToken) return false;
  return true;
}

const SESSION_EXPIRED_DEBOUNCE_MS = 5000;
let lastSessionExpiredAt = Number.NEGATIVE_INFINITY;

/** Émet `popcorn:session-expired` au plus une fois par fenêtre (rafales de 401 en parallèle). */
export function dispatchSessionExpiredOnce(now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  if (now - lastSessionExpiredAt < SESSION_EXPIRED_DEBOUNCE_MS) return false;
  lastSessionExpiredAt = now;
  window.dispatchEvent(new CustomEvent('popcorn:session-expired'));
  return true;
}

/** Tests uniquement. */
export function __resetSessionExpiredDebounce(): void {
  lastSessionExpiredAt = Number.NEGATIVE_INFINITY;
}
