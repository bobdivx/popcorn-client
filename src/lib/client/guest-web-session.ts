/**
 * Jeton popcorn-web d'un invité (utilisateur local), conservé brièvement après une connexion par
 * lien / Quick Connect. Il n'est PAS un jeton cloud (un invité n'en a jamais : voir
 * lib/permissions.ts) : il sert uniquement aux appels « invité » de popcorn-web
 * (GET / PUT /api/v1/local-users/me : nom de profil, définition du mot de passe).
 * Durée de vie : celle du jeton (≈ 1 h), lié à l'id de l'invité.
 */

export const GUEST_WEB_SESSION_KEY = 'popcornn_guest_web_session';

interface StoredGuestWebSession {
  token: string;
  userId: string;
  /** Expiration (ms epoch) lue dans le jeton. */
  exp: number;
}

/** Expiration (ms) d'un JWT, ou null si illisible. */
export function readJwtExpiryMs(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function setGuestWebToken(token: string, userId: string): void {
  if (typeof window === 'undefined' || !token || !userId) return;
  const exp = readJwtExpiryMs(token) ?? Date.now() + 55 * 60 * 1000;
  try {
    const value: StoredGuestWebSession = { token, userId, exp };
    localStorage.setItem(GUEST_WEB_SESSION_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Jeton encore valide (marge 30 s) pour cet invité, sinon null (et nettoyage). */
export function getGuestWebToken(userId: string | null | undefined): string | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(GUEST_WEB_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StoredGuestWebSession>;
    if (!s.token || s.userId !== userId || typeof s.exp !== 'number' || s.exp - 30_000 <= Date.now()) {
      if (s.userId !== userId || (typeof s.exp === 'number' && s.exp <= Date.now())) clearGuestWebToken();
      return null;
    }
    return s.token;
  } catch {
    return null;
  }
}

export function clearGuestWebToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GUEST_WEB_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
