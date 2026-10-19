/**
 * Cache « stale-while-revalidate » des lectures API peu volatiles (catalogue torrents, listes et fiches TMDB).
 *
 * Pourquoi : chaque navigation (Accueil ⇄ Films ⇄ Séries, retour de fiche) remontait les rangées et
 * refaisait toutes les requêtes ; sur webOS / Android chaque relance repartait de zéro.
 * - Mémoire (session) + IndexedDB (persistant entre relances, toutes plateformes : web, Tauri, webOS).
 * - Entrée « fraîche » (< fresh) : servie sans réseau.
 * - Entrée périmée (< maxAge) : servie tout de suite, revalidée en arrière-plan ; si la réponse change,
 *   l'évènement window `popcorn:swr-update` ({ endpoint }) permet aux hooks de se rafraîchir sans spinner.
 * - Toute écriture réussie (POST/PUT/PATCH/DELETE) rend tout le cache « à revalider » ;
 *   `popcorn:torrents-cleared` purge le catalogue.
 * Désactivable : localStorage.popcorn_api_swr = 'off'.
 */
import type { ApiResponse } from './types.js';

export interface SwrPolicy {
  /** Durée pendant laquelle la réponse est servie sans réseau (ms). */
  fresh: number;
  /** Au-delà, la réponse n'est plus servie du tout (ms). */
  maxAge: number;
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Politique par endpoint (GET uniquement). null = jamais mis en cache. */
export function swrPolicyFor(endpoint: string, method?: string): SwrPolicy | null {
  if (method && method.toUpperCase() !== 'GET') return null;
  const ep = endpoint || '';
  // Catalogue torrents (accueil, films, séries) : change au fil des synchros.
  if (ep.startsWith('/api/torrents/list') || ep.startsWith('/api/torrents/fast')) return { fresh: 60 * SEC, maxAge: DAY };
  // TMDB (cache serveur 6 h) : fiches, recommandations, listes « du moment », découverte.
  if (ep.startsWith('/api/discover/sliders')) return null;
  if (/^\/api\/discover\/(movie|tv)\/\d+/.test(ep)) return { fresh: 6 * HOUR, maxAge: 7 * DAY };
  if (ep.startsWith('/api/discover/')) return { fresh: 30 * MIN, maxAge: 3 * DAY };
  return null;
}

interface Entry {
  k: string;
  ep: string;
  at: number;
  /** Plus de « fraîcheur » (écriture côté serveur depuis) : à revalider au prochain accès. */
  st?: boolean;
  v: ApiResponse<unknown>;
}

const MEM_MAX = 250;
const DB_MAX = 200;
/** Réponses trop lourdes : mémoire seulement (évite de saturer IndexedDB sur TV). */
const PERSIST_MAX_CHARS = 1_500_000;
const DB_NAME = 'popcorn-api-cache';
const STORE = 'r';

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<ApiResponse<unknown>>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let listenersInstalled = false;

function disabled(): boolean {
  try {
    return typeof window === 'undefined' || localStorage.getItem('popcorn_api_swr') === 'off';
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' }).createIndex('at', 'at');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbGet(key: string): Promise<Entry | null> {
  return openDb().then(
    (db) =>
      new Promise<Entry | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
          r.onsuccess = () => resolve((r.result as Entry) || null);
          r.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

let trimTimer: ReturnType<typeof setTimeout> | null = null;
function idbPut(e: Entry): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(e);
    } catch {
      /* quota / clone : mémoire seulement */
    }
    if (!trimTimer) trimTimer = setTimeout(() => { trimTimer = null; idbTrim(); }, 15 * SEC);
  });
}

/** Supprime les entrées expirées (> 7 j) puis les plus anciennes au-delà de DB_MAX. */
function idbTrim(): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const countReq = store.count();
      countReq.onsuccess = () => {
        let excess = countReq.result - DB_MAX;
        const limit = Date.now() - 7 * DAY;
        const cur = store.index('at').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const e = c.value as Entry;
          if (excess > 0 || e.at < limit) {
            c.delete();
            excess -= 1;
            c.continue();
          }
        };
      };
    } catch {
      /* ignore */
    }
  });
}

function idbUpdateAll(fn: (e: Entry) => Entry | null): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const cur = db.transaction(STORE, 'readwrite').objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        const next = fn(c.value as Entry);
        if (next === null) c.delete();
        else if (next !== c.value) c.update(next);
        c.continue();
      };
    } catch {
      /* ignore */
    }
  });
}

function remember(e: Entry): void {
  mem.delete(e.k);
  mem.set(e.k, e);
  while (mem.size > MEM_MAX) {
    const first = mem.keys().next().value as string | undefined;
    if (first === undefined) break;
    mem.delete(first);
  }
}

/** Écriture réussie : tout devient « à revalider » (toujours servi immédiatement, puis rafraîchi). */
export function markAllSwrStale(): void {
  for (const e of mem.values()) e.st = true;
  idbUpdateAll((e) => (e.st ? e : { ...e, st: true }));
}

/** Purge les entrées dont l'endpoint commence par `prefix`. */
export function dropSwrPrefix(prefix: string): void {
  for (const [k, e] of mem) if (e.ep.startsWith(prefix)) mem.delete(k);
  idbUpdateAll((e) => (e.ep.startsWith(prefix) ? null : e));
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  try {
    window.addEventListener('popcorn:torrents-cleared', () => dropSwrPrefix('/api/torrents/'));
  } catch {
    /* ignore */
  }
}

function sameData(a: ApiResponse<unknown>, b: ApiResponse<unknown>): boolean {
  try {
    return JSON.stringify(a.data) === JSON.stringify(b.data);
  } catch {
    return false;
  }
}

function emitUpdate(endpoint: string): void {
  try {
    window.dispatchEvent(new CustomEvent('popcorn:swr-update', { detail: { endpoint } }));
  } catch {
    /* ignore */
  }
}

function store(key: string, endpoint: string, v: ApiResponse<unknown>): Entry {
  const e: Entry = { k: key, ep: endpoint, at: Date.now(), v };
  remember(e);
  let size = 0;
  try {
    size = JSON.stringify(v.data ?? null).length;
  } catch {
    size = PERSIST_MAX_CHARS + 1;
  }
  if (size <= PERSIST_MAX_CHARS) idbPut(e);
  return e;
}

function network<T>(key: string, endpoint: string, run: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  const pending = inflight.get(key) as Promise<ApiResponse<T>> | undefined;
  if (pending) return pending;
  const p = run().then(
    (res) => {
      inflight.delete(key);
      if (res && res.success) store(key, endpoint, res as ApiResponse<unknown>);
      return res;
    },
    (err) => {
      inflight.delete(key);
      throw err;
    }
  );
  inflight.set(key, p as Promise<ApiResponse<unknown>>);
  return p;
}

/**
 * Lecture avec cache SWR. `run` fait la vraie requête réseau.
 * Les erreurs ne sont jamais mises en cache ; hors ligne, une entrée périmée (< maxAge) reste servie.
 */
export async function swrRequest<T>(
  key: string,
  endpoint: string,
  policy: SwrPolicy,
  run: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  if (disabled()) return run();
  installListeners();
  const now = Date.now();
  let e: Entry | null | undefined = mem.get(key);
  if (!e) {
    e = await idbGet(key);
    if (e) remember(e);
  }
  if (e && now - e.at < policy.maxAge && e.v && e.v.success) {
    const isFresh = !e.st && now - e.at < policy.fresh;
    if (!isFresh) {
      const served = e.v;
      void network(key, endpoint, run)
        .then((res) => {
          if (res && res.success && !sameData(served, res as ApiResponse<unknown>)) emitUpdate(endpoint);
        })
        .catch(() => {});
    }
    return e.v as ApiResponse<T>;
  }
  return network(key, endpoint, run);
}

/** Vide tout (tests / déconnexion). */
export function clearSwrCache(): void {
  mem.clear();
  idbUpdateAll(() => null);
}

/**
 * Hook utilitaire : appelle `onUpdate` (débouncé) quand une revalidation apporte des données
 * différentes pour un endpoint correspondant à `match`.
 */
export function onSwrUpdate(match: (endpoint: string) => boolean, onUpdate: () => void, debounceMs = 400): () => void {
  if (typeof window === 'undefined') return () => {};
  let t: ReturnType<typeof setTimeout> | null = null;
  const handler = (ev: Event) => {
    const ep = (ev as CustomEvent<{ endpoint?: string }>).detail?.endpoint || '';
    if (!match(ep)) return;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      onUpdate();
    }, debounceMs);
  };
  window.addEventListener('popcorn:swr-update', handler);
  return () => {
    if (t) clearTimeout(t);
    window.removeEventListener('popcorn:swr-update', handler);
  };
}
