export type UserRole = 'admin' | 'dev' | 'guest';

// Cache pour les vérifications dev (1 heure)
const devCheckCache = new Map<string, { isDev: boolean; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 heure

/**
 * Interface pour un utilisateur avec rôle
 */
export interface UserWithRole {
  id: string;
  username: string;
  email?: string | null;
  role?: string | null;
  is_admin?: number;
}

/**
 * Vérifie si un email est un dev en appelant l'API popcorn-vercel
 */
export async function checkDevRole(email: string | null | undefined): Promise<boolean> {
  if (!email) {
    return false;
  }

  // Vérifier le cache
  const cached = devCheckCache.get(email.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.isDev;
  }

  try {
    // Récupérer l'URL de l'API popcorn-vercel
    const apiUrl = import.meta.env.POPCORN_VERCEL_API_URL || 'http://localhost:4321/api/v1';
    const url = `${apiUrl}/users/check-dev?email=${encodeURIComponent(email)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Roles] Erreur lors de la vérification du rôle dev pour ${email}:`, response.statusText);
      // En cas d'erreur, retourner false et mettre en cache pour éviter trop d'appels
      devCheckCache.set(email.toLowerCase(), { isDev: false, timestamp: Date.now() });
      return false;
    }

    const data = await response.json();
    const isDev = data.isDev === true;
    
    // Mettre en cache
    devCheckCache.set(email.toLowerCase(), { isDev, timestamp: Date.now() });
    
    return isDev;
  } catch (error) {
    console.warn(`[Roles] Erreur lors de la vérification du rôle dev pour ${email}:`, error);
    // En cas d'erreur, retourner false et mettre en cache pour éviter trop d'appels
    devCheckCache.set(email.toLowerCase(), { isDev: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * Vérifie si un utilisateur peut accéder aux routes admin
 */
export async function canAccessAdminRoute(user: UserWithRole): Promise<boolean> {
  // Vérifier si l'utilisateur est admin
  if (user.is_admin === 1) {
    return true;
  }

  // Vérifier si l'utilisateur a le rôle admin
  if (user.role === 'admin') {
    return true;
  }

  // Vérifier si l'utilisateur est dev (via l'API)
  if (user.email) {
    const isDev = await checkDevRole(user.email);
    if (isDev) {
      return true;
    }
  }

  return false;
}

/**
 * Vérifie si un utilisateur peut modifier les rôles (admin uniquement)
 */
export async function canModifyRoles(user: UserWithRole): Promise<boolean> {
  return await canAccessAdminRoute(user);
}

/**
 * Récupère le rôle d'un utilisateur depuis la base de données
 */
export async function getUserRoleFromDb(userId: string): Promise<UserWithRole | null> {
  try {
    const { getBackendUrlAsync } = await import('../backend-url.js');
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/client/auth/users/${encodeURIComponent(userId)}`;

    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json().catch(() => ({}));
    const u = data?.data;
    if (!u?.id) return null;

    return {
      id: u.id,
      username: u.username,
      email: u.email ?? null,
      role: u.role ?? null,
      is_admin: u.is_admin ? 1 : 0,
    };
  } catch (error) {
    console.error('Erreur lors de la récupération du rôle utilisateur:', error);
    return null;
  }
}
