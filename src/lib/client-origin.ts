/**
 * Détection "client cloud" vs "client local" pour adapter le comportement
 * (sauvegarde clientUrl, libellés, redirections, etc.).
 *
 * - Client cloud : https://client.popcornn.app (ou domaine hébergeant le client officiel)
 * - Client local : toute autre origine (Docker, NAS, localhost, etc.)
 *
 * Le layout pose aussi data-client-origin="cloud" | "local" sur <html> (script inline)
 * pour usage en CSS ou sans importer ce module.
 */

const CLOUD_CLIENT_HOST = 'client.popcornn.app';

/**
 * Retourne true si l'app tourne sur le client cloud (client.popcornn.app).
 * À utiliser côté navigateur (window disponible).
 */
export function isCloudClient(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location?.hostname || '').toLowerCase();
  return host === CLOUD_CLIENT_HOST || host.endsWith('.' + CLOUD_CLIENT_HOST);
}

/**
 * Type d'origine du client pour la logique métier.
 */
export type ClientOriginType = 'cloud' | 'local';

/**
 * Retourne 'cloud' si l'origine est le client officiel, 'local' sinon.
 */
export function getClientOriginType(): ClientOriginType {
  return isCloudClient() ? 'cloud' : 'local';
}

/**
 * Retourne l'origine actuelle (ex. https://client.popcornn.app ou http://192.168.1.100:4321).
 * Chaîne vide en SSR.
 */
export function getClientOrigin(): string {
  if (typeof window === 'undefined') return '';
  const o = window.location?.origin || '';
  return o.replace(/\/$/, '');
}
