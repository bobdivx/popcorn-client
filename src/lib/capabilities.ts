/**
 * Capacités du serveur Popcornn connecté (GET /api/client/capabilities).
 *
 * Le cœur du serveur est un lecteur de médiathèque ; le moteur torrent et les indexers sont
 * des modules optionnels. Le client n'affiche l'interface d'un module que si le serveur
 * l'annonce. Serveur ancien (route absente → 404) : on garde le comportement historique
 * (tout disponible) pour ne rien casser.
 *
 * Lecture synchrone depuis un cache (mémoire + localStorage) pour les fonctions non réactives
 * (menus, étapes du wizard) ; `useServerCapabilities()` charge / rafraîchit et notifie.
 */
import { useEffect, useState } from 'preact/hooks';
import { getBackendUrl } from './backend-config';

export interface CapabilityFeatures {
  player: boolean;
  library: boolean;
  discover: boolean;
  requests: boolean;
  transcoding: boolean;
  torrent: boolean;
  stream_torrent: boolean;
  indexers: boolean;
  sync: boolean;
  uploads: boolean;
  ratio_tools: boolean;
  [key: string]: boolean;
}

/** Module installé depuis une URL (GET /api/client/capabilities → modules.installed). */
export interface InstalledModuleSummary {
  id: string;
  name: string;
  version: string;
  kind: string;
  provides: string[];
  active: boolean;
  /**
   * Activé par l'administrateur (POST …/enable | …/disable). Absent des serveurs antérieurs
   * aux routes d'activation : vaut alors `true` (un module installé y est toujours activé).
   */
  enabled: boolean;
}

/** Module « process » résumé dans les capacités (`modules.process`). */
export interface ProcessModuleSummary {
  id: string;
  version: string;
  enabled: boolean;
  state: string;
  provides: string[];
}

export interface ServerCapabilities {
  apiVersion: number;
  serverVersion: string | null;
  edition: 'core' | 'full' | 'legacy';
  /**
   * Toutes les capacités annoncées par le serveur (`features`), y compris celles que le client ne
   * connaît pas encore : les clés booléennes inconnues sont conservées telles quelles.
   */
  features: CapabilityFeatures;
  /** Features Cargo compilées dans le binaire (`compiled_features`). Absent des anciens serveurs / caches. */
  compiledFeatures?: string[];
  modules: {
    host: boolean;
    specVersion: number | null;
    defaultRepository: string | null;
    definitionsRepositoryConfigured: boolean;
    /** Modules installés depuis une URL (aucun par défaut). Absent des anciens caches. */
    installed?: InstalledModuleSummary[];
    /**
     * Le serveur sait lancer des modules « process » (binaires signés, `modules.process` présent).
     * `false` : serveur plus ancien. Absent des anciens caches (inconnu → le client sonde la route).
     */
    processHost?: boolean;
    /**
     * Catalogue officiel signé (« store ») annoncé par le serveur (`modules.catalog`).
     * `undefined` : serveur ancien ou cache ancien (le client sonde la route, 404 → masqué).
     */
    catalog?: boolean;
    /** Modules « process » résumés (`modules.process`). Absent des anciens serveurs / caches. */
    process?: ProcessModuleSummary[];
    /**
     * Le serveur connaît les routes d'activation / désactivation / désinstallation génériques
     * (`POST /api/client/admin/modules/{id}/enable|disable`, `DELETE …/{id}?remove_data=`).
     * Détecté sur la réponse (champ `enabled` des modules, capacité `sharing`) ; `false` / absent :
     * serveur plus ancien → boutons masqués (une réponse 404 / 405 les masque aussi).
     */
    toggleRoutes?: boolean;
  };
  /** Serveur antérieur à la route capabilities (comportement historique). */
  legacy: boolean;
  /** URL du serveur interrogé (le cache est invalidé si elle change). */
  backendUrl: string;
  fetchedAt: number;
}

const STORAGE_KEY = 'popcorn.serverCapabilities.v1';
const EVENT_NAME = 'popcorn:capabilities';
const TTL_MS = 10 * 60 * 1000;

let memory: ServerCapabilities | null = null;
let inflight: Promise<ServerCapabilities | null> | null = null;

function normalizeUrl(url: string | null | undefined): string {
  return (url || '').trim().replace(/\/+$/, '');
}

function currentBackendUrl(): string {
  try {
    return normalizeUrl(getBackendUrl());
  } catch {
    return '';
  }
}

function legacyCapabilities(backendUrl: string): ServerCapabilities {
  return {
    apiVersion: 0,
    serverVersion: null,
    edition: 'legacy',
    features: {
      player: true,
      library: true,
      discover: true,
      requests: true,
      transcoding: true,
      torrent: true,
      stream_torrent: true,
      indexers: true,
      sync: true,
      // Upload vers trackers / outils de ratio : retirés du produit, quel que soit le serveur.
      uploads: false,
      ratio_tools: false,
    },
    modules: {
      host: false,
      specVersion: null,
      defaultRepository: null,
      definitionsRepositoryConfigured: false,
      installed: [],
      processHost: false,
      process: [],
      toggleRoutes: false,
    },
    legacy: true,
    backendUrl,
    fetchedAt: Date.now(),
  };
}

function parseInstalled(raw: unknown): InstalledModuleSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as any).id === 'string')
    .map((x) => ({
      id: x.id as string,
      name: typeof x.name === 'string' ? x.name : (x.id as string),
      version: typeof x.version === 'string' ? x.version : '',
      kind: typeof x.kind === 'string' ? x.kind : '',
      provides: Array.isArray(x.provides) ? x.provides.filter((p): p is string => typeof p === 'string') : [],
      active: x.active !== false,
      enabled: x.enabled !== false,
    }));
}

function parseProcess(raw: unknown): ProcessModuleSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as any).id === 'string')
    .map((x) => ({
      id: x.id as string,
      version: typeof x.version === 'string' ? x.version : '',
      enabled: x.enabled !== false,
      state: typeof x.state === 'string' ? x.state : '',
      provides: Array.isArray(x.provides) ? x.provides.filter((p): p is string => typeof p === 'string') : [],
    }));
}

/** Le serveur annonce-t-il les routes d'activation génériques ? (voir `modules.toggleRoutes`) */
function detectToggleRoutes(features: Record<string, unknown>, m: Record<string, unknown>): boolean {
  if (typeof features.sharing === 'boolean') return true;
  const hasEnabled = (raw: unknown) =>
    Array.isArray(raw) && raw.some((x) => !!x && typeof x === 'object' && typeof (x as any).enabled === 'boolean');
  return hasEnabled(m.installed) || hasEnabled(m.process);
}

/**
 * Analyse la réponse de GET /api/client/capabilities (enveloppe `{ success, data }` ou objet nu).
 * `null` : réponse inexploitable. Exportée pour les tests.
 */
export function parseCapabilities(json: any, backendUrl: string): ServerCapabilities | null {
  const d = json && typeof json === 'object' ? (json.data ?? json) : null;
  if (!d || typeof d !== 'object' || typeof d.features !== 'object' || d.features === null) return null;
  const f = d.features as Record<string, unknown>;
  const b = (k: string, fallback = false) => (typeof f[k] === 'boolean' ? (f[k] as boolean) : fallback);
  const features: CapabilityFeatures = {
    player: b('player', true),
    library: b('library', true),
    discover: b('discover', true),
    requests: b('requests', true),
    transcoding: b('transcoding', true),
    torrent: b('torrent'),
    stream_torrent: b('stream_torrent'),
    indexers: b('indexers'),
    sync: b('sync'),
    uploads: false,
    ratio_tools: false,
  };
  // Capacités supplémentaires annoncées par le serveur (partage, IA…) : conservées pour l'affichage.
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'boolean' && !(k in features)) features[k] = v;
  }
  const m = (d.modules && typeof d.modules === 'object' ? d.modules : {}) as Record<string, unknown>;
  return {
    apiVersion: typeof d.api_version === 'number' ? d.api_version : 1,
    serverVersion: typeof d.server_version === 'string' ? d.server_version : null,
    edition: d.edition === 'core' ? 'core' : 'full',
    features,
    compiledFeatures: Array.isArray(d.compiled_features)
      ? d.compiled_features.filter((x: unknown): x is string => typeof x === 'string')
      : undefined,
    modules: {
      host: m.host === true,
      specVersion: typeof m.spec_version === 'number' ? m.spec_version : null,
      defaultRepository: typeof m.default_repository === 'string' ? m.default_repository : null,
      definitionsRepositoryConfigured: m.definitions_repository_configured === true,
      installed: parseInstalled(m.installed),
      processHost: Array.isArray(m.process),
      catalog: typeof m.catalog === 'boolean' ? m.catalog : undefined,
      process: parseProcess(m.process),
      toggleRoutes: detectToggleRoutes(f, m),
    },
    legacy: false,
    backendUrl,
    fetchedAt: Date.now(),
  };
}

function readStorage(): ServerCapabilities | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ServerCapabilities;
    return v && typeof v === 'object' && v.features ? v : null;
  } catch {
    return null;
  }
}

function write(v: ServerCapabilities | null): void {
  memory = v;
  if (typeof window === 'undefined') return;
  try {
    if (v) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // stockage indisponible (mode privé, quota) : cache mémoire seulement
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
  } catch {
    // ignore
  }
}

/**
 * Capacités connues pour le serveur actuel, sans appel réseau.
 * `null` = inconnues (premier lancement, autre serveur) : les appelants gardent le comportement historique.
 */
export function getCachedCapabilities(): ServerCapabilities | null {
  const v = memory ?? readStorage();
  if (!v) return null;
  memory = v;
  const url = currentBackendUrl();
  if (url && normalizeUrl(v.backendUrl) !== url) return null;
  return v;
}

/** Vrai sauf si le serveur annonce explicitement que la capacité est absente. */
export function isCapabilityAvailable(feature: keyof CapabilityFeatures): boolean {
  const caps = getCachedCapabilities();
  if (!caps) return feature !== 'uploads' && feature !== 'ratio_tools';
  return caps.features[feature] === true;
}

/**
 * Capacité utilisable d'après `caps` (fonction pure, testable) :
 * - capacités inconnues (`null`) ou serveur antérieur aux capacités → vrai (comportement historique) ;
 * - clé absente de `features` (serveur qui ne connaît pas encore ce module) → vrai ;
 * - sinon la valeur annoncée. `uploads` / `ratio_tools` : toujours faux (retirés du produit).
 */
export function isFeatureEnabled(caps: ServerCapabilities | null, feature: string): boolean {
  if (feature === 'uploads' || feature === 'ratio_tools') return false;
  if (!caps || caps.legacy) return true;
  const v = caps.features[feature];
  return typeof v === 'boolean' ? v : true;
}

/** Partage de bibliothèque (menus / page Amis) : `sharing` (ou alias `friends`) non désactivé. */
export function isSharingEnabled(caps: ServerCapabilities | null): boolean {
  if (!caps || caps.legacy) return true;
  const values = ['sharing', 'friends'].map((k) => caps.features[k]).filter((v) => typeof v === 'boolean');
  return values.length === 0 || values.some((v) => v === true);
}

/** Demandes de contenu : `requests` ET le module Indexers (dont elles dépendent). */
export function isRequestsEnabled(caps: ServerCapabilities | null): boolean {
  if (!caps || caps.legacy) return true;
  return caps.features.requests !== false && caps.features.indexers === true;
}

/** Le serveur connaît les routes génériques enable / disable / DELETE des modules. */
export function supportsModuleToggle(caps: ServerCapabilities | null): boolean {
  return !!caps && !caps.legacy && caps.modules.toggleRoutes === true;
}

/** Vrai si un module actif installé depuis une URL fournit la capacité (ex. `indexer_definitions`). */
export function hasInstalledModuleProviding(capability: string): boolean {
  const caps = getCachedCapabilities();
  return !!caps?.modules.installed?.some((m) => m.active && m.provides.includes(capability));
}

/** Charge (ou recharge) les capacités du serveur courant. Ne jette jamais. */
export function loadCapabilities(options: { force?: boolean } = {}): Promise<ServerCapabilities | null> {
  const backendUrl = currentBackendUrl();
  if (!backendUrl) return Promise.resolve(null);
  const cached = getCachedCapabilities();
  if (!options.force && cached && Date.now() - cached.fetchedAt < TTL_MS) return Promise.resolve(cached);
  if (inflight) {
    // Rechargement forcé (après une action sur un module) : la requête en cours a pu partir avant
    // le changement → on relance une requête fraîche une fois celle-ci terminée.
    if (!options.force) return inflight;
    return inflight.then(() => loadCapabilities({ force: true }));
  }
  inflight = (async () => {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
      const res = await fetch(`${backendUrl}/api/client/capabilities`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      if (timer) clearTimeout(timer);
      if (res.status === 404 || res.status === 405) {
        const legacy = legacyCapabilities(backendUrl);
        write(legacy);
        return legacy;
      }
      if (!res.ok) return cached;
      const parsed = parseCapabilities(await res.json().catch(() => null), backendUrl);
      if (parsed) write(parsed);
      return parsed ?? cached;
    } catch {
      // Serveur injoignable : on garde le dernier état connu.
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Invalide le cache (mémoire + localStorage) sans attendre le TTL de 10 min : la prochaine lecture
 * recharge. Les autres onglets voient le changement via l'événement `storage`.
 */
export function invalidateCapabilities(): void {
  const cached = memory ?? readStorage();
  if (!cached) return;
  memory = { ...cached, fetchedAt: 0 };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

/**
 * Après une action sur un module (activation, désactivation, désinstallation…) : invalide le cache,
 * recharge tout de suite et notifie menus et pages (`useServerCapabilities`). Ne jette jamais.
 */
export async function refreshCapabilitiesNow(): Promise<ServerCapabilities | null> {
  invalidateCapabilities();
  return loadCapabilities({ force: true });
}

/** Revalidation au retour sur l'onglet / l'appli si le cache a plus de 30 s (module activé ailleurs). */
const REVALIDATE_ON_FOCUS_MS = 30 * 1000;
let focusRevalidationInstalled = false;

function installFocusRevalidation(): void {
  if (focusRevalidationInstalled || typeof window === 'undefined') return;
  focusRevalidationInstalled = true;
  const revalidate = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const cached = getCachedCapabilities();
    if (cached && Date.now() - cached.fetchedAt < REVALIDATE_ON_FOCUS_MS) return;
    void loadCapabilities({ force: true });
  };
  try {
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
  } catch {
    // ignore
  }
}

/** Abonnement aux changements (retourne la fonction de désabonnement). */
export function subscribeCapabilities(listener: (caps: ServerCapabilities | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  installFocusRevalidation();
  const handler = (e: Event) => listener((e as CustomEvent<ServerCapabilities | null>).detail ?? null);
  // Autre onglet : module activé / désinstallé depuis Paramètres > Modules → mise à jour immédiate ici.
  const storageHandler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    memory = null;
    listener(getCachedCapabilities());
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

/** Hook : capacités du serveur courant (chargées au montage, mises à jour en direct). */
export function useServerCapabilities(): ServerCapabilities | null {
  const [caps, setCaps] = useState<ServerCapabilities | null>(() => getCachedCapabilities());
  useEffect(() => {
    const unsub = subscribeCapabilities((c) => setCaps(c));
    void loadCapabilities().then((c) => {
      if (c) setCaps(c);
    });
    return unsub;
  }, []);
  return caps;
}
