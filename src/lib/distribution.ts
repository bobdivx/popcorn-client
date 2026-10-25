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

import { getCachedCapabilities, isCapabilityAvailable } from './capabilities';

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

/**
 * Demandes de contenu utilisables : build non store ET serveur annonçant `requests` et `indexers`
 * (une demande approuvée n'aboutit que si le module Indexers est installé). Capacités inconnues /
 * serveur ancien → vrai (comportement historique).
 */
export function isRequestsAvailable(): boolean {
  return TORRENT_FEATURES_ENABLED && isCapabilityAvailable('requests') && isCapabilityAvailable('indexers');
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

/**
 * Routes qui exigent le module Indexers (catalogue / synchro), même avec le moteur torrent.
 * `/search` n'en fait pas partie : sans indexers, elle cherche dans la bibliothèque locale.
 */
export const INDEXERS_MODULE_ROUTE_PREFIXES: readonly string[] = [
  '/settings/indexers',
  '/settings/indexer-definitions',
  '/settings/library-indexer',
  '/settings/sync',
  // Hub « Indexers & synchro » (TMDB y est aussi, mais a sa page du cœur /settings/tmdb).
  '/settings/content',
  // Hub « Découverte & demandes » : rangées, demandes, liste noire, quotas.
  '/settings/discovery',
  // Liste noire : ne filtre que les résultats des indexers (recherche / catalogue).
  '/settings/blacklist',
  // Rangées de découverte : n'existent qu'avec le catalogue (voir docs/SETTINGS_MODULES.md).
  '/settings/discover-sliders',
];

/**
 * Découverte TMDB (fiche d'un titre absent de la bibliothèque, catalogue par plateforme) :
 * réservée aux serveurs avec le module Indexers (sans lui, rien ne peut être demandé ni téléchargé :
 * mode « media center » = bibliothèque seule). Masquée aussi si `discover` est explicitement à `false`.
 */
export const DISCOVER_ROUTE_PREFIXES: readonly string[] = ['/discover', '/plateformes', '/settings/discover-sliders'];

/** Routes des demandes de contenu (voir `isRequestsAvailable`). */
export const REQUESTS_ROUTE_PREFIXES: readonly string[] = ['/demandes', '/requests', '/settings/requests-admin'];

/**
 * Fonctions optionnelles (futurs modules) : leurs pages ne sont masquées que si le serveur annonce
 * EXPLICITEMENT la capacité à `false` (clé absente / serveur ancien → affichées, comportement actuel).
 */
export const OPTIONAL_FEATURE_ROUTE_PREFIXES: ReadonlyArray<{ features: readonly string[]; prefixes: readonly string[] }> = [
  { features: ['sharing', 'friends'], prefixes: ['/settings/friends'] },
  { features: ['ai'], prefixes: ['/settings/ai'] },
  { features: ['webos_deployment', 'webos'], prefixes: ['/settings/webos-deployment'] },
  // Module activable « Voiture » : lecteur /car, labo /car/lab, diagnostic /car/probe.
  { features: ['car_lab', 'car'], prefixes: ['/car'] },
];

/** Capacités du module activable « Voiture » (`car` = alias). */
export const CAR_MODULE_FEATURES: readonly string[] = ['car_lab', 'car'];

/** Module Voiture utilisable : masqué seulement si le serveur l'annonce explicitement à `false`. */
export function isCarModuleAvailable(): boolean {
  return !isFeatureExplicitlyDisabled(CAR_MODULE_FEATURES);
}

/** Vrai si le serveur connecté annonce explicitement l'une de ces capacités à `false` (et aucune à `true`). */
export function isFeatureExplicitlyDisabled(features: readonly string[]): boolean {
  const caps = getCachedCapabilities();
  if (!caps) return false;
  const values = features.map((f) => caps.features[f]).filter((v) => typeof v === 'boolean');
  return values.length > 0 && values.every((v) => v === false);
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const p = (pathname || '/').replace(/\/+$/, '') || '/';
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Capacité manquante pour une route (ex. `torrent`, `indexers`, `requests`, `ai`), ou `null` si la route
 * est utilisable. Ne tient compte que des capacités annoncées par le serveur (pas de la version store).
 */
export function missingCapabilityForRoute(pathname: string): string | null {
  if (IS_STORE_BUILD) return null;
  if (!isTorrentModuleAvailable() && matchesPrefix(pathname, TORRENT_MODULE_ROUTE_PREFIXES)) {
    return matchesPrefix(pathname, REQUESTS_ROUTE_PREFIXES) ? 'requests' : 'torrent';
  }
  if (!isIndexersModuleAvailable() && matchesPrefix(pathname, INDEXERS_MODULE_ROUTE_PREFIXES)) return 'indexers';
  if (!isRequestsAvailable() && matchesPrefix(pathname, REQUESTS_ROUTE_PREFIXES)) return 'requests';
  if (matchesPrefix(pathname, DISCOVER_ROUTE_PREFIXES)) {
    if (!isIndexersModuleAvailable()) return 'indexers';
    if (isFeatureExplicitlyDisabled(['discover'])) return 'discover';
  }
  for (const entry of OPTIONAL_FEATURE_ROUTE_PREFIXES) {
    if (matchesPrefix(pathname, entry.prefixes) && isFeatureExplicitlyDisabled(entry.features)) {
      return entry.features[0];
    }
  }
  return null;
}

/**
 * Vrai si la route ne doit pas être proposée : fonction retirée, version store, ou module
 * absent du serveur connecté (nom historique conservé pour les appelants).
 */
export function isRouteBlockedInStoreBuild(pathname: string): boolean {
  if (matchesPrefix(pathname, RETIRED_ROUTE_PREFIXES)) return true;
  if (IS_STORE_BUILD) return matchesPrefix(pathname, STORE_BLOCKED_ROUTE_PREFIXES);
  return missingCapabilityForRoute(pathname) !== null;
}

/** Fiche découverte `/discover` utilisable (hors store, serveur avec Indexers, `discover` non désactivé). */
export function isDiscoverAvailable(): boolean {
  return !isRouteBlockedInStoreBuild('/discover');
}

/**
 * Catalogue torrent (rangées « populaires », « nouveaux films »…) consultable : il est servi par le
 * module Indexers (`/api/torrents/list`). Sans lui, l'accueil / Films / Séries montrent la bibliothèque.
 * Capacités inconnues / serveur ancien → vrai (comportement historique).
 */
export function isTorrentCatalogAvailable(): boolean {
  return TORRENT_FEATURES_ENABLED && isIndexersModuleAvailable();
}

/** Catégories de paramètres masquées dans la version store. */
const STORE_HIDDEN_SETTINGS_CATEGORIES = new Set(['content', 'downloads', 'uploads', 'discovery']);

/** Catégories propres au module torrent / indexers. */
const TORRENT_MODULE_SETTINGS_CATEGORIES = new Set(['content', 'downloads', 'discovery']);

/** Catégories qui exigent le module Indexers, même avec le moteur torrent (hubs `content` / `discovery`). */
const INDEXERS_MODULE_SETTINGS_CATEGORIES = new Set(['content', 'discovery']);

export function isSettingsCategoryAvailable(categoryId: string): boolean {
  // Upload vers trackers (C411) / ratio : retirés.
  if (categoryId === 'uploads') return false;
  if (IS_STORE_BUILD) return !STORE_HIDDEN_SETTINGS_CATEGORIES.has(categoryId);
  if (!isTorrentModuleAvailable()) return !TORRENT_MODULE_SETTINGS_CATEGORIES.has(categoryId);
  if (!isIndexersModuleAvailable()) return !INDEXERS_MODULE_SETTINGS_CATEGORIES.has(categoryId);
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
const MODULE_SETTINGS_ROUTE_PREFIXES: readonly string[] = Array.from(
  new Set([...TORRENT_MODULE_ROUTE_PREFIXES, ...INDEXERS_MODULE_ROUTE_PREFIXES, ...DISCOVER_ROUTE_PREFIXES]),
).filter((p) => p.startsWith('/settings/'));

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
