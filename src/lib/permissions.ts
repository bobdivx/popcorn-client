/**
 * Système de permissions pour gérer les accès selon le type d'utilisateur
 */

import { TokenManager } from './client/storage.js';

export type UserType = 'cloud' | 'local';

/**
 * Récupère le type d'utilisateur actuel
 */
export function getUserType(): UserType | null {
  const user = TokenManager.getUser();
  if (!user) {
    return null;
  }

  // Invité (profil du compte principal) : rôle « local » ou session serveur d'invité (`pls1.`)
  // sans jeton cloud. Vérifié AVANT le jeton cloud pour qu'un invité ne soit jamais
  // considéré comme le compte principal.
  if (user.role === 'local') {
    return 'local';
  }
  const serverSession = TokenManager.getServerSessionToken();
  if (!TokenManager.getCloudAccessToken() && serverSession && serverSession.startsWith('pls1.')) {
    return 'local';
  }

  // Si l'utilisateur a un token cloud, c'est un compte principal
  if (TokenManager.getCloudAccessToken()) {
    return 'cloud';
  }

  // Si le role n'est pas défini ou est différent de 'local', c'est un compte principal (cloud)
  // Par défaut, considérer comme cloud pour les comptes existants
  return 'cloud';
}

/**
 * Vérifie si l'utilisateur actuel est le compte principal (cloud)
 */
export function isCloudAccount(): boolean {
  return getUserType() === 'cloud';
}

/**
 * Vérifie si l'utilisateur actuel est un utilisateur local
 */
export function isLocalUser(): boolean {
  return getUserType() === 'local';
}

/**
 * Vérifie si l'utilisateur peut accéder à une fonctionnalité
 */
export function canAccess(feature: Permission): boolean {
  const userType = getUserType();
  if (!userType) {
    return false;
  }

  // Les comptes cloud ont accès à tout
  if (userType === 'cloud') {
    return true;
  }

  // Invités (utilisateurs locaux) = profils de lecture du compte principal : ils parcourent,
  // lisent et TÉLÉCHARGENT tout ; seuls les réglages / l'administration sont réservés.
  const localUserPermissions: Record<Permission, boolean> = {
    // Accès complet : catalogue, lecture, téléchargements (ajout de torrents, progression)
    'library.view': true,
    'torrents.view': true,
    'torrents.download': true,
    'media.view': true,
    'media.stream': true,
    'downloads.view': true,

    // Réglages personnels uniquement
    'settings.language': true,
    'settings.ui_preferences': true,
    'settings.profile': true,

    // Accès refusé (gestion du serveur et du compte principal)
    'library.manage': false,
    'settings.download_location': false,
    'settings.indexers': false,
    'settings.tmdb': false,
    'settings.sync': false,
    'settings.server': false,
    'settings.friends': false, // Réservé au compte principal
    'settings.local_users': false, // Les utilisateurs locaux ne peuvent pas gérer d'autres utilisateurs locaux
    'settings.account': false, // Les utilisateurs locaux ne peuvent pas modifier leur compte (géré par le compte principal)
  };

  return localUserPermissions[feature] ?? false;
}

/**
 * Liste des permissions disponibles
 */
export type Permission =
  // Bibliothèque
  | 'library.view'
  | 'library.manage'
  // Torrents
  | 'torrents.view'
  | 'torrents.download'
  // Médias
  | 'media.view'
  | 'media.stream'
  // Téléchargements
  | 'downloads.view'
  // Paramètres
  | 'settings.language'
  /** Profil personnel (nom affiché, avatar, déconnexion) : ouvert aux invités. */
  | 'settings.profile'
  | 'settings.ui_preferences'
  | 'settings.download_location'
  | 'settings.indexers'
  | 'settings.tmdb'
  | 'settings.sync'
  | 'settings.server'
  | 'settings.friends'
  | 'settings.local_users'
  | 'settings.account';

/**
 * Hook pour vérifier une permission (à utiliser dans les composants Preact)
 */
export function usePermission(feature: Permission): boolean {
  return canAccess(feature);
}
