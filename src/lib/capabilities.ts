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
}

export interface ServerCapabilities {
  apiVersion: number;
  serverVersion: string | null;
  edition: 'core' | 'full' | 'legacy';
  features: CapabilityFeatures;
  modules: {
    host: boolean;
    specVersion: number | null;
    defaultRepository: string | null;
    definitionsRepositoryConfigured: boolean;
    /** Modules installés depuis une URL (aucun par défaut). Absent des anciens caches. */
    installed?: InstalledModuleSummary[];
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
    }));
}

function parse(json: any, backendUrl: string): ServerCapabilities | null {
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
  const m = (d.modules && typeof d.modules === 'object' ? d.modules : {}) as Record<string, unknown>;
  return {
    apiVersion: typeof d.api_version === 'number' ? d.api_version : 1,
    serverVersion: typeof d.server_version === 'string' ? d.server_version : null,
    edition: d.edition === 'core' ? 'core' : 'full',
    features,
    modules: {
      host: m.host === true,
      specVersion: typeof m.spec_version === 'number' ? m.spec_version : null,
      defaultRepository: typeof m.default_repository === 'string' ? m.default_repository : null,
      definitionsRepositoryConfigured: m.definitions_repository_configured === true,
      installed: parseInstalled(m.installed),
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
  if (inflight) return inflight;
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
      const parsed = parse(await res.json().catch(() => null), backendUrl);
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

/** Abonnement aux changements (retourne la fonction de désabonnement). */
export function subscribeCapabilities(listener: (caps: ServerCapabilities | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => listener((e as CustomEvent<ServerCapabilities | null>).detail ?? null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
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
