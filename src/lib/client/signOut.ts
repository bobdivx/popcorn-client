/**
 * Déconnexion complète de l'appareil : session serveur (jetons locaux + utilisateur courant),
 * session cloud popcorn-web (jetons cloud, secret JWT, session invité) et jeton média.
 * Réutilise la logique existante (`serverApi.logout` → `clearTokens`, `TokenManager.clearTokens`).
 * Ne lit ni n'affiche aucun jeton.
 */
export interface SignOutDeps {
  serverLogout: () => void | Promise<void>;
  clearAllTokens: () => void;
  clearMediaToken: () => void;
}

async function defaultDeps(): Promise<SignOutDeps> {
  const [{ serverApi }, { TokenManager }, { clearMediaToken }] = await Promise.all([
    import('./server-api.js'),
    import('./storage.js'),
    import('../streaming/mediaToken.js'),
  ]);
  return {
    serverLogout: () => serverApi.logout(),
    clearAllTokens: () => TokenManager.clearTokens(),
    clearMediaToken,
  };
}

/** Chaque étape est indépendante : un échec n'empêche pas les suivantes. */
export async function signOutEverywhere(deps?: SignOutDeps): Promise<void> {
  const d = deps ?? (await defaultDeps());
  const steps: Array<() => void | Promise<void>> = [d.serverLogout, d.clearAllTokens, d.clearMediaToken];
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      console.warn('[signOut] étape de déconnexion en échec', e instanceof Error ? e.message : e);
    }
  }
}

export type ServerRoleLabel = 'admin' | 'member' | 'unknown';

/** Rôle serveur affichable à partir de `isServerAdmin*` (true / false / null = inconnu). */
export function serverRoleLabel(isAdmin: boolean | null | undefined): ServerRoleLabel {
  if (isAdmin === true) return 'admin';
  if (isAdmin === false) return 'member';
  return 'unknown';
}
