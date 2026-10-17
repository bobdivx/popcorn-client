/**
 * Variante de distribution (build-time).
 *
 * `PUBLIC_DISTRIBUTION=play` produit la version « store » (Google Play) : un lecteur pour
 * serveur multimédia personnel (comme Jellyfin / Plex). Cette variante ne contient PAS les
 * fonctionnalités torrent : recherche/navigation de torrents, indexers, client torrent,
 * téléchargements, synchronisation depuis les indexers, RSS, demandes de contenu.
 * Elle se connecte au serveur de l'utilisateur et lit uniquement les fichiers déjà présents
 * dans sa bibliothèque.
 *
 * Sans la variable (web, webOS, desktop, APK GitHub), rien ne change.
 */

const RAW_DISTRIBUTION = String(import.meta.env.PUBLIC_DISTRIBUTION ?? '')
  .trim()
  .toLowerCase();

export type Distribution = 'default' | 'play';

export const DISTRIBUTION: Distribution = RAW_DISTRIBUTION === 'play' ? 'play' : 'default';

/** Vrai pour la version Google Play (aucune fonctionnalité torrent). */
export const IS_STORE_BUILD: boolean = DISTRIBUTION === 'play';

/** Fonctionnalités torrent / indexers / téléchargements disponibles dans ce build. */
export const TORRENT_FEATURES_ENABLED: boolean = !IS_STORE_BUILD;

/** Chemin de la fiche média (lecture d'un élément de la bibliothèque). */
export const MEDIA_DETAIL_PATH: string = IS_STORE_BUILD ? '/media' : '/torrents';

/**
 * Routes absentes de la version store (supprimées du build + redirigées si atteintes).
 * Partagé avec scripts/astro/store-distribution.mjs (garder les deux listes alignées).
 */
export const STORE_BLOCKED_ROUTE_PREFIXES: readonly string[] = [
  '/torrents',
  '/downloads',
  '/search',
  '/discover',
  '/demandes',
  '/requests',
  '/demo',
  '/features',
  '/installation',
  '/disclaimer',
  '/settings/indexers',
  '/settings/indexer-definitions',
  '/settings/library-indexer',
  '/settings/sync',
  '/settings/librqbit',
  '/settings/ratio',
  '/settings/uploads',
  '/settings/requests-admin',
  '/settings/blacklist',
  '/settings/discover-sliders',
  '/settings/content',
  '/settings/downloads',
  '/settings/discovery',
  '/settings/diagnostics',
  '/settings/audit',
];

export function isRouteBlockedInStoreBuild(pathname: string): boolean {
  if (!IS_STORE_BUILD) return false;
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return STORE_BLOCKED_ROUTE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Catégories de paramètres masquées dans la version store. */
const STORE_HIDDEN_SETTINGS_CATEGORIES = new Set(['content', 'downloads', 'uploads', 'discovery']);

export function isSettingsCategoryAvailable(categoryId: string): boolean {
  if (!IS_STORE_BUILD) return true;
  return !STORE_HIDDEN_SETTINGS_CATEGORIES.has(categoryId);
}

/**
 * Endpoints serveur liés aux torrents / indexers / téléchargements.
 * La version store ne les appelle jamais (voir src/lib/store/network-guard.ts).
 */
const TORRENT_API_PATTERNS: readonly RegExp[] = [
  /^\/api\/torrents(\/|$)/,
  /^\/api\/indexers(\/|$)/,
  /^\/api\/sync(\/|$)/,
  /^\/api\/client\/torrents(\/|$)/,
  /^\/api\/client\/admin\/indexers(\/|$)/,
  /^\/api\/client\/stream-torrent(\/|$)/,
  /^\/api\/client\/librqbit(\/|$)/,
  /^\/api\/client\/uploader(\/|$)/,
  /^\/api\/client\/flaresolverr(\/|$)/,
  /^\/api\/client\/indexer-definitions(\/|$)/,
  /^\/api\/stream-torrent(\/|$)/,
  /^\/api\/blacklist(\/|$)/,
  /^\/api\/admin\/torrents(\/|$)/,
  /^\/api\/admin\/download-clients(\/|$)/,
  /^\/api\/admin\/rss-feeds(\/|$)/,
  /^\/api\/admin\/quality-upgrades(\/|$)/,
  /^\/api\/admin\/watchlist(\/|$)/,
  /^\/api\/admin\/exclusions(\/|$)/,
  /^\/api\/admin\/indexers(\/|$)/,
  /^\/api\/admin\/client-torrent(\/|$)/,
  /^\/api\/admin\/tracker-mode(\/|$)/,
  /^\/api\/admin\/trackers(\/|$)/,
  /^\/api\/admin\/seeding-diagnostic(\/|$)/,
  /^\/api\/admin\/torrent-files(\/|$)/,
  /^\/api\/library\/upload-tracker(\/|$)/,
  /^\/api\/library\/uploader(\/|$)/,
  /^\/api\/requests(\/|$)/,
  /^\/api\/media-requests(\/|$)/,
  /^\/librqbit(\/|$)/,
  /^\/announce(\/|$)/,
  /^\/api\/v1\/indexer-definitions(\/|$)/,
];

/** Sources des regex (pour le garde réseau inline injecté dans Layout.astro). */
export const TORRENT_API_PATTERN_SOURCES: string[] = TORRENT_API_PATTERNS.map((re) => re.source);

export function isTorrentApiPath(pathname: string): boolean {
  return TORRENT_API_PATTERNS.some((re) => re.test(pathname));
}

/** Vrai si l'URL (absolue ou relative) vise un endpoint torrent et que ce build est la version store. */
export function isBlockedApiUrl(url: string): boolean {
  if (!IS_STORE_BUILD) return false;
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const u = new URL(url, base);
    return isTorrentApiPath(u.pathname);
  } catch {
    return false;
  }
}
