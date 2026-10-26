/**
 * Erreurs liées aux modules du serveur (fonctions pures, testées dans module-errors.test.ts).
 *
 * - `404 module_not_installed` : la fonction (partage, demandes…) est devenue un module absent ou
 *   inactif sur ce serveur. Corps : `{ success: false, data: { code, capability }, error }`.
 * - 404 / 405 sans corps : route inconnue d'un serveur plus ancien (fonction non gérée).
 */

type ApiLike = { success: boolean; error?: string; message?: string; details?: string };

/**
 * Capacité manquante annoncée par un corps `module_not_installed` (`''` si non précisée),
 * `null` si le corps n'est pas une erreur `module_not_installed`.
 */
export function moduleNotInstalledCapability(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as { code?: unknown; capability?: unknown };
  if (d.code !== 'module_not_installed') return null;
  return typeof d.capability === 'string' ? d.capability : '';
}

/** Vrai si la réponse signifie « module non installé / inactif sur ce serveur ». */
export function isModuleNotInstalled(res: ApiLike | null | undefined): boolean {
  if (!res || res.success) return false;
  if (res.error === 'ModuleNotInstalled') return true;
  return /module_not_installed|module non install/i.test(res.message || '');
}

/** Capacité manquante d'une réponse `module_not_installed` (repli : `fallback`). */
export function missingModuleCapability(res: ApiLike | null | undefined, fallback: string): string {
  if (!res) return fallback;
  const d = (res.details || '').trim();
  if (res.error === 'ModuleNotInstalled' && /^[a-z0-9_-]{1,40}$/i.test(d)) return d;
  const m = /module non install[ée]\s*:\s*([a-z0-9_-]{1,40})/i.exec(res.message || '');
  return m ? m[1] : fallback;
}

/**
 * Vrai si l'échec signifie « route inconnue de ce serveur » (serveur ancien) : 404 sans corps
 * exploitable ou 405. Une 404 métier (module introuvable, `module_not_installed`) n'en est pas une.
 */
export function isRouteUnsupported(res: ApiLike | null | undefined): boolean {
  if (!res || res.success) return false;
  if (res.error === 'ModuleNotInstalled') return false;
  if (res.error === 'NotFound') return true;
  return /^Erreur (404|405)$/.test((res.message || '').trim());
}

/** Lien vers Paramètres > Modules expliquant la capacité manquante. */
export function modulesPageHref(capability?: string | null): string {
  const c = (capability || '').trim();
  return /^[a-z0-9_-]{1,40}$/i.test(c) ? `/settings/modules/?missing=${encodeURIComponent(c)}` : '/settings/modules/';
}

/**
 * Routes historiques des fonctions devenues modules (miroir de `LEGACY_PREFIXES` du serveur,
 * backend/src/modules/legacy.rs, + demandes). Le plus long préfixe correspondant l'emporte.
 */
const MODULE_API_PREFIXES: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    'torrent',
    [
      '/announce',
      '/librqbit',
      '/api/client/librqbit',
      '/api/client/torrents',
      '/api/client/stream-torrent',
      '/api/stream-torrent',
      '/api/admin/client-torrent',
      '/api/admin/download-clients',
      '/api/admin/torrent-files',
      '/api/admin/torrents',
      '/api/admin/tags',
      '/api/torrents/external',
      '/api/torrents/list-files',
    ],
  ],
  [
    'indexers',
    [
      '/api/indexers',
      '/api/sync',
      '/api/torrents',
      '/api/admin/indexers',
      '/api/client/admin/indexers',
      '/api/admin/quality-profiles',
      '/api/admin/quality-upgrades',
      '/api/admin/rss-feeds',
      '/api/admin/watchlist',
      '/api/admin/exclusions',
      '/api/client/flaresolverr',
      '/api/client/indexer-definitions',
      '/api/debug/check-torrent-download',
    ],
  ],
  ['sharing', ['/api/friends']],
  ['requests', ['/api/requests', '/api/media-requests']],
];

/** Capacité (module) dont relève une route d'API, `null` pour une route du cœur. */
export function moduleApiCapability(endpoint: string): string | null {
  const path = endpoint.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  let best: { cap: string; len: number } | null = null;
  for (const [cap, prefixes] of MODULE_API_PREFIXES) {
    for (const p of prefixes) {
      if ((path === p || path.startsWith(`${p}/`)) && (!best || p.length > best.len)) best = { cap, len: p.length };
    }
  }
  return best?.cap ?? null;
}

/**
 * Capacité absente qui rend l'appel inutile : le serveur annonce explicitement la fonction
 * désactivée (il répondrait `404 module_not_installed`). Capacités inconnues, serveur ancien
 * ou clé absente : `null` (on appelle, comportement historique).
 */
export function blockedModuleCapability(
  endpoint: string,
  caps: { legacy?: boolean; features: Record<string, boolean> } | null,
): string | null {
  if (!caps || caps.legacy) return null;
  const cap = moduleApiCapability(endpoint);
  if (!cap) return null;
  return caps.features[cap] === false ? cap : null;
}
