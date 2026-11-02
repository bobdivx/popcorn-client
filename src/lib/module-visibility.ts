/**
 * Visibilité des entrées d'interface liées aux modules optionnels (torrent, demandes).
 *
 * Règle : ces entrées (onglet « Demandes », icône Téléchargements, rangée « Les plus téléchargés »)
 * sont MASQUÉES PAR DÉFAUT. Elles n'apparaissent que si le serveur connecté les annonce
 * (GET /api/client/capabilities) ou s'il s'agit d'un serveur antérieur aux capacités (legacy,
 * comportement historique conservé). Jamais en mode démo (pas de serveur réel) ni dans la version store.
 *
 * Fonctions pures (testables) : l'appelant fournit les capacités et le contexte.
 */
import { isRequestsEnabled, type ServerCapabilities } from './capabilities';

export interface ModuleVisibilityContext {
  /** Mode démo (URL /demo, flag local, compte de démonstration). */
  demo: boolean;
  /** Fonctionnalités torrent présentes dans ce build (faux pour les versions store). */
  buildEnabled: boolean;
}

/** Icône / lien Téléchargements et rangées liées au moteur torrent. */
export function isTorrentUiVisible(caps: ServerCapabilities | null, ctx: ModuleVisibilityContext): boolean {
  if (!ctx.buildEnabled || ctx.demo || !caps) return false;
  if (caps.legacy) return true;
  return caps.features.torrent === true;
}

/** Onglet « Demandes » : capacité `requests` + module Indexers. */
export function isRequestsUiVisible(caps: ServerCapabilities | null, ctx: ModuleVisibilityContext): boolean {
  if (!ctx.buildEnabled || ctx.demo || !caps) return false;
  return isRequestsEnabled(caps);
}
