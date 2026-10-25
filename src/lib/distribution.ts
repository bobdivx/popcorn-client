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

import { isCapabilityAvailable } from './capabilities';

export type Distribution = 'default' | 'play';

/**
 * Vrai pour la version Google Play (aucune fonctionnalité torrent).
 * Comparaison littérale sur import.meta.env (remplacé au build) pour que le bundler élimine
 * le code torrent mort de la version store.
 */
export const IS_STORE_BUILD: boolean = import.meta.env.PUBLIC_DISTRIBUTION === 'play';

export const DISTRIBUTION: Distribution = IS_STORE_BUILD ? 'play' : 'default';

/** Fonctionnalités torrent / indexers / téléchargements disponibles dans ce build. */
export const TORRENT_FEATURES_ENABLED: boolean = import.meta.env.PUBLIC_DISTRIBUTION !== 'play';

/**
 * Module torrent utilisable : présent dans ce build ET annoncé par le serveur connecté
 * (GET /api/client/capabilities). Serveur ancien ou capacités inconnues → vrai (comportement historique).
 */
export function isTorrentModuleAvailable(): boolean {
  return TORRENT_FEATURES_ENABLED && isCapabilityAvailable('torrent');
}

/** Module indexers utilisable (build + serveur). */
export function isIndexersModuleAvailable(): boolean {
  return TORRENT_FEATURES_ENABLED && isCapabilityAvailable('indexers');
}

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
  '/settings/modules',
];

/** Fonctions retirées du produit (upload vers trackers / C411, outils de ratio) : jamais affichées. */
export const RETIRED_ROUTE_PREFIXES: readonly string[] = ['/settings/uploads', '/settings/ratio'];

/**
 * Routes du module torrent / indexers, masquées quand le serveur connecté ne les propose pas.
 * (La fiche média /torrents reste accessible : elle sert aussi à lire la bibliothèque.)
 */
export const TORRENT_MODULE_ROUTE_PREFIXES: readonly string[] = [
  '/downloads',
  '/search',
  '/demandes',
  '/requests',
  '/settings/indexers',
  '/settings/indexer-definitions',
  '/settings/library-indexer',
  '/settings/sync',
  '/settings/librqbit',
  '/settings/requests-admin',
  '/settings/blacklist',
  '/settings/discover-sliders',
  '/settings/content',
  '/settings/downloads',
  '/settings/discovery',
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Vrai si la route ne doit pas être proposée : fonction retirée, version store, ou module
 * torrent absent du serveur connecté (nom historique conservé pour les appelants).
 */
export function isRouteBlockedInStoreBuild(pathname: string): boolean {
  if (matchesPrefix(pathname, RETIRED_ROUTE_PREFIXES)) return true;
  if (IS_STORE_BUILD) return matchesPrefix(pathname, STORE_BLOCKED_ROUTE_PREFIXES);
  if (!isTorrentModuleAvailable()) return matchesPrefix(pathname, TORRENT_MODULE_ROUTE_PREFIXES);
  return false;
}

/** Catégories de paramètres masquées dans la version store. */
const STORE_HIDDEN_SETTINGS_CATEGORIES = new Set(['content', 'downloads', 'uploads', 'discovery']);

/** Catégories propres au module torrent / indexers. */
const TORRENT_MODULE_SETTINGS_CATEGORIES = new Set(['content', 'downloads', 'discovery']);

export function isSettingsCategoryAvailable(categoryId: string): boolean {
  // Upload vers trackers (C411) / ratio : retirés.
  if (categoryId === 'uploads') return false;
  if (IS_STORE_BUILD) return !STORE_HIDDEN_SETTINGS_CATEGORIES.has(categoryId);
  if (!isTorrentModuleAvailable()) return !TORRENT_MODULE_SETTINGS_CATEGORIES.has(categoryId);
  return true;
}

/**
 * Catégories dont les réglages appartiennent à un module (moteur torrent, indexers + synchro,
 * découverte / demandes) : pas de tuile de premier niveau dans le hub ni dans les menus.
 * Leurs pages restent des sous-pages ouvertes depuis Paramètres > Modules (détail de la fonction).
 */
export const MODULE_OWNED_SETTINGS_CATEGORIES: ReadonlySet<string> = new Set(['content', 'downloads', 'discovery']);

/** Catégorie affichée au premier niveau des paramètres (cœur, disponible dans ce build / serveur). */
export function isHubSettingsCategory(categoryId: string): boolean {
  return isSettingsCategoryAvailable(categoryId) && !MODULE_OWNED_SETTINGS_CATEGORIES.has(categoryId);
}

/** Pages de réglages propres à un module (torrent / indexers / synchro / découverte / demandes). */
const MODULE_SETTINGS_ROUTE_PREFIXES: readonly string[] = TORRENT_MODULE_ROUTE_PREFIXES.filter((p) =>
  p.startsWith('/settings/'),
);

/** Vrai pour une page de réglages d'un module : son « Retour » mène à Paramètres > Modules. */
export function isModuleSettingsRoute(pathname: string): boolean {
  return matchesPrefix(pathname, MODULE_SETTINGS_ROUTE_PREFIXES);
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
  /^\/api\/client\/admin\/modules(\/|$)/,
  // Modules « process » : admin (/api/client/admin/modules/process, couvert ci-dessus) et proxy.
  /^\/api\/modules(\/|$)/,
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
