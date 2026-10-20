/**
 * Images TMDB (affiches, backdrops, logos) : affichage rapide et cache durable sur TOUTES les plateformes.
 *
 * Patch global de HTMLImageElement.src / setAttribute('src') limité aux URLs image.tmdb.org :
 * 1. Taille : « original » (souvent 4K, plusieurs Mo) → w780 / w1280 selon l'écran (même URL partout → cache).
 * 2. PAS de crossOrigin sur les <img> : le CDN TMDB n'envoie Access-Control-Allow-Origin que si la requête
 *    porte un en-tête Origin, sans « Vary: Origin ». Une image déjà dans le cache HTTP (chargée sans CORS,
 *    max-age ≈ 1 an) échouait donc en <img crossorigin> → icône d'image cassée partout (régression 1.4.18).
 * 3. Premières cartes de chaque page : chargement immédiat (pas d'attente du lazy-loading).
 * 4. Mode « idb » (apps : Tauri Android/TV/desktop, webOS natif http://127.0.0.1, client http LAN) :
 *    cache persistant IndexedDB (Blob) + URLs blob: en mémoire. Le Service Worker n'y est pas utilisable
 *    (schéma Tauri, ou cache SW/HTTP vidé à chaque fermeture d'app sur webOS) ; IndexedDB, lui, persiste.
 *    Plafonds : 80 Mo / 800 images, 30 jours, LRU.
 * 5. Filet de sécurité : toute <img> TMDB en erreur (blob: révoquée, entrée de cache corrompue, CORS…)
 *    est rechargée depuis l'URL TMDB d'origine, sans crossorigin ; l'entrée fautive est purgée.
 * Web https : le Service Worker public/img-cache-sw.js garde ce rôle (mode « sw »).
 *
 * Réglages (localStorage.popcorn_img_cache) : 'off' (aucun patch), 'idb' (forcer le cache JS), 'sw'.
 */
import { isTauri } from '../utils/tauri';
import { isTVPlatform } from '../utils/device-detection';

export type ImageCacheMode = 'sw' | 'idb' | 'none';

const TMDB_RE = /^https?:\/\/image\.tmdb\.org\/t\/p\/([a-z0-9_]+)\//i;
const DB_NAME = 'popcorn-img-cache';
const STORE = 'img';
/** Incrémenter pour purger une fois le cache IndexedDB des clients existants. */
const CACHE_GEN = '2';
const CACHE_GEN_KEY = 'popcorn_img_cache_gen';
const MAX_ENTRIES = 800;
const MAX_BYTES = 80 * 1024 * 1024;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** URLs blob: gardées en mémoire (session) : réaffichage instantané en navigation. */
const MEM_MAX_ENTRIES = 300;
const MEM_MAX_BYTES = 48 * 1024 * 1024;
/** Images de chaque page chargées sans attendre le lazy-loading (premières cartes / hero). */
const EAGER_FIRST = 8;
/** Tentatives de secours par <img> avant de laisser l'erreur atteindre le composant. */
const MAX_RECOVERIES = 2;

interface Rec {
  u: string;
  b: Blob | ArrayBuffer;
  ty?: string;
  t: number;
  s: number;
}

let installed = false;
let mode: ImageCacheMode = 'none';
let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Index des URLs présentes en base (chargé une fois) : une URL absente part tout de suite sur le réseau. */
let knownKeys: Set<string> | null = null;
let knownPromise: Promise<void> | null = null;
const mem = new Map<string, { url: string; size: number }>();
let memBytes = 0;
/** URL TMDB normalisée voulue par chaque <img> (ce que renvoie le getter src). */
const wanted = new WeakMap<HTMLImageElement, string>();
/** URL TMDB brute (avant normalisation) : dernier recours si la taille normalisée échoue. */
const rawWanted = new WeakMap<HTMLImageElement, string>();
const recoveries = new WeakMap<HTMLImageElement, number>();
let pageRank = 0;
const storing = new Set<string>();
const storeQueue: string[] = [];
let storeActive = 0;
/** Setter / getter src sous-jacents (natifs, ou ceux d'un autre patch installé avant). */
let baseSrcSet: ((this: HTMLImageElement, v: string) => void) | null = null;
let baseSrcGet: ((this: HTMLImageElement) => string) | null = null;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function lsSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function detectImageCacheMode(): ImageCacheMode | 'off' {
  if (typeof window === 'undefined') return 'off';
  const forced = lsGet('popcorn_img_cache');
  if (forced === 'off') return 'off';
  const idbOk =
    typeof indexedDB !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof fetch === 'function';
  if (forced === 'idb') return idbOk ? 'idb' : 'none';
  if (forced === 'sw') return 'sw';
  if (isTauri()) return idbOk ? 'idb' : 'none';
  const loc = window.location;
  const swUsable =
    loc.protocol === 'https:' && 'serviceWorker' in navigator && 'caches' in window && lsGet('popcorn_img_sw') !== 'off';
  if (swUsable) return 'sw';
  return idbOk ? 'idb' : 'none';
}

export function getImageCacheMode(): ImageCacheMode {
  return mode;
}

/** Même règle que tmdb-images.heroBackdropSize (dupliquée : pas d'import circulaire). */
function screenBackdropSize(): string {
  try {
    if (isTVPlatform()) return 'w1280';
    const vw = Math.max(window.innerWidth || 0, (window.screen && window.screen.width) || 0);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return vw * dpr <= 900 ? 'w780' : 'w1280';
  } catch {
    return 'w1280';
  }
}

/** Normalise une URL TMDB (taille « original » → taille écran). Autres URLs inchangées. */
export function normalizeTmdbUrl(url: string): string {
  const m = TMDB_RE.exec(url);
  if (!m) return url;
  if (m[1].toLowerCase() === 'original') return url.replace(TMDB_RE, (s) => s.replace(/\/original\/$/i, `/${screenBackdropSize()}/`));
  return url;
}

function isTmdb(v: unknown): v is string {
  return typeof v === 'string' && TMDB_RE.test(v);
}

/**
 * Téléchargement CORS d'une image TMDB → Blob image, ou null.
 * Le cache HTTP contient souvent une copie chargée sans CORS (donc sans Access-Control-Allow-Origin) :
 * la 1re tentative échoue alors (TypeError) et on recharge une fois depuis le réseau.
 */
function fetchImageBlob(url: string): Promise<Blob | null> {
  const read = (res: Response): Promise<Blob | null> | null => {
    if (!res || !res.ok) return null;
    const type = res.headers.get('Content-Type') || '';
    if (type && type.indexOf('image/') !== 0) return null;
    return res.blob().then((b) => (b && b.size > 0 && (!b.type || b.type.indexOf('image/') === 0) ? b : null));
  };
  return fetch(url, { mode: 'cors', credentials: 'omit' })
    .then(read, () => fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' }).then(read))
    .catch(() => null);
}

// ---------------------------------------------------------------- IndexedDB

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'u' }).createIndex('t', 't');
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          db.onversionchange = () => db.close();
        } catch {
          /* ignore */
        }
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Purge unique du cache IndexedDB quand CACHE_GEN change (entrées d'une version fautive). */
function purgeIfOldGeneration(): Promise<void> {
  if (lsGet(CACHE_GEN_KEY) === CACHE_GEN) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        if (!db) return resolve();
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => {
            lsSet(CACHE_GEN_KEY, CACHE_GEN);
            resolve();
          };
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      })
  );
}

function loadKnownKeys(): Promise<void> {
  if (knownPromise) return knownPromise;
  knownPromise = purgeIfOldGeneration()
    .then(() => openDb())
    .then(
      (db) =>
        new Promise<void>((resolve) => {
          if (!db) {
            knownKeys = new Set();
            return resolve();
          }
          try {
            const store = db.transaction(STORE, 'readonly').objectStore(STORE);
            const done = (keys: IDBValidKey[]) => {
              knownKeys = new Set(keys.map(String));
              resolve();
            };
            if (typeof store.getAllKeys === 'function') {
              const r = store.getAllKeys();
              r.onsuccess = () => done(r.result || []);
              r.onerror = () => done([]);
            } else {
              const keys: IDBValidKey[] = [];
              const c = store.openCursor();
              c.onsuccess = () => {
                const cur = c.result;
                if (!cur) return done(keys);
                keys.push(cur.key);
                cur.continue();
              };
              c.onerror = () => done(keys);
            }
          } catch {
            knownKeys = new Set();
            resolve();
          }
        })
    )
    .catch(() => {
      knownKeys = new Set();
    });
  return knownPromise;
}

function dbGet(url: string): Promise<Blob | null> {
  return openDb().then(
    (db) =>
      new Promise<Blob | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, 'readonly');
          const r = tx.objectStore(STORE).get(url);
          r.onsuccess = () => {
            const rec = r.result as Rec | undefined;
            if (!rec) return resolve(null);
            const age = Date.now() - (rec.t || 0);
            if (age > TTL_MS) {
              knownKeys?.delete(url);
              return resolve(null);
            }
            const blob = rec.b instanceof Blob ? rec.b : new Blob([rec.b], { type: rec.ty || 'image/jpeg' });
            if (age > TOUCH_AFTER_MS) dbPut({ ...rec, t: Date.now() });
            resolve(blob.size > 0 ? blob : null);
          };
          r.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

function dbDelete(url: string): void {
  knownKeys?.delete(url);
  void openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(url);
    } catch {
      /* ignore */
    }
  });
}

function dbPut(rec: Rec): void {
  void openDb().then((db) => {
    if (!db) return;
    const write = (value: Rec, retryAsBuffer: boolean) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value);
        tx.oncomplete = () => {
          knownKeys?.add(value.u);
          scheduleTrim();
        };
        tx.onerror = () => {
          const err = tx.error;
          if (err && err.name === 'QuotaExceededError') trim(true);
          else if (retryAsBuffer && value.b instanceof Blob) asBuffer(value);
        };
      } catch (e) {
        // DataCloneError : moteur sans Blob en IndexedDB (vieux WebKit) → ArrayBuffer.
        if (retryAsBuffer && value.b instanceof Blob) asBuffer(value);
      }
    };
    const asBuffer = (value: Rec) => {
      const blob = value.b as Blob;
      const reader = new FileReader();
      reader.onload = () => write({ ...value, b: reader.result as ArrayBuffer, ty: blob.type }, false);
      reader.readAsArrayBuffer(blob);
    };
    write(rec, true);
  });
}

let trimTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleTrim(): void {
  if (trimTimer) return;
  trimTimer = setTimeout(() => {
    trimTimer = null;
    trim(false);
  }, 20000);
}

/** Supprime les entrées expirées puis les plus anciennes au-delà des plafonds (nombre / octets). */
function trim(aggressive: boolean): void {
  const maxEntries = aggressive ? Math.floor(MAX_ENTRIES * 0.7) : MAX_ENTRIES;
  const maxBytes = aggressive ? Math.floor(MAX_BYTES * 0.7) : MAX_BYTES;
  void openDb().then((db) => {
    if (!db) return;
    try {
      const rows: { u: string; t: number; s: number }[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const c = tx.objectStore(STORE).index('t').openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (cur) {
          const v = cur.value as Rec;
          rows.push({ u: v.u, t: v.t || 0, s: v.s || 0 });
          cur.continue();
          return;
        }
        // rows triées par date croissante (index t)
        let count = rows.length;
        let total = rows.reduce((a, r) => a + r.s, 0);
        const now = Date.now();
        const victims: string[] = [];
        for (const r of rows) {
          if (now - r.t > TTL_MS || count > maxEntries || total > maxBytes) {
            victims.push(r.u);
            count -= 1;
            total -= r.s;
          }
        }
        if (!victims.length) return;
        const wtx = db.transaction(STORE, 'readwrite');
        const st = wtx.objectStore(STORE);
        for (const u of victims) {
          st.delete(u);
          knownKeys?.delete(u);
        }
      };
    } catch {
      /* ignore */
    }
  });
}

// ---------------------------------------------------------------- mémoire (URLs blob:)

function memGet(url: string): string | null {
  const e = mem.get(url);
  if (!e) return null;
  mem.delete(url);
  mem.set(url, e);
  return e.url;
}

function memPut(url: string, blob: Blob): string {
  const existing = memGet(url);
  if (existing) return existing;
  const objectUrl = URL.createObjectURL(blob);
  mem.set(url, { url: objectUrl, size: blob.size });
  memBytes += blob.size;
  while (mem.size > MEM_MAX_ENTRIES || memBytes > MEM_MAX_BYTES) {
    const first = mem.keys().next().value as string | undefined;
    if (first === undefined) break;
    const e = mem.get(first)!;
    mem.delete(first);
    memBytes -= e.size;
    // Une <img> déjà affichée garde son image décodée ; une <img> encore « lazy » qui pointerait
    // sur cette URL révoquée est rattrapée par le filet d'erreur (retour à l'URL TMDB).
    setTimeout(() => URL.revokeObjectURL(e.url), 60000);
  }
  return objectUrl;
}

/** Oublie une image (mémoire + IndexedDB) : utilisée quand sa copie en cache n'a pas pu s'afficher. */
function forget(url: string): void {
  const e = mem.get(url);
  if (e) {
    mem.delete(url);
    memBytes -= e.size;
    const objectUrl = e.url;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
  dbDelete(url);
}

// ---------------------------------------------------------------- stockage après chargement réseau

function enqueueStore(url: string): void {
  if (storing.has(url) || mem.has(url) || knownKeys?.has(url)) return;
  storing.add(url);
  storeQueue.push(url);
  pumpStore();
}

function pumpStore(): void {
  while (storeActive < 3 && storeQueue.length) {
    const url = storeQueue.shift()!;
    storeActive += 1;
    fetchImageBlob(url)
      .then((blob) => {
        if (!blob) return;
        memPut(url, blob);
        dbPut({ u: url, b: blob, t: Date.now(), s: blob.size });
      })
      .catch(() => {})
      .then(() => {
        storeActive -= 1;
        storing.delete(url);
        pumpStore();
      });
  }
}

// ---------------------------------------------------------------- patch <img>

function prioritize(img: HTMLImageElement): void {
  if (pageRank >= EAGER_FIRST) return;
  pageRank += 1;
  const rank = pageRank;
  // Après le diff Preact (loading="lazy" est posé après src) : lever le lazy pour les premières images.
  Promise.resolve().then(() => {
    try {
      if (img.loading === 'lazy') img.loading = 'eager';
      if (rank <= 4 && 'fetchPriority' in img) (img as HTMLImageElement & { fetchPriority: string }).fetchPriority = 'high';
    } catch {
      /* ignore */
    }
  });
}

function applyTmdb(img: HTMLImageElement, raw: string, rawSet: (v: string) => void): void {
  const url = normalizeTmdbUrl(raw);
  if (wanted.get(img) !== url) recoveries.delete(img);
  wanted.set(img, url);
  rawWanted.set(img, raw);
  prioritize(img);
  if (mode !== 'idb') {
    rawSet(url);
    return;
  }
  const hit = memGet(url);
  if (hit) {
    rawSet(hit);
    return;
  }
  const fromNetwork = () => {
    if (wanted.get(img) !== url) return;
    rawSet(url);
    const onLoad = () => {
      img.removeEventListener('load', onLoad);
      if (wanted.get(img) === url) enqueueStore(url);
    };
    img.addEventListener('load', onLoad);
  };
  const lookup = () => {
    if (wanted.get(img) !== url) return;
    if (!knownKeys || !knownKeys.has(url)) return fromNetwork();
    dbGet(url).then(
      (blob) => {
        if (wanted.get(img) !== url) return;
        if (blob) rawSet(memPut(url, blob));
        else fromNetwork();
      },
      fromNetwork
    );
  };
  if (knownKeys) lookup();
  else loadKnownKeys().then(lookup, fromNetwork);
}

/**
 * Filet de sécurité : une <img> TMDB en erreur est rechargée depuis l'URL d'origine (sans crossorigin,
 * sans blob:) avant que l'erreur n'atteigne le composant (qui masquerait l'image). Capture au niveau
 * window : l'évènement « error » des images ne remonte pas, mais la phase de capture le voit.
 */
function installErrorFallback(): void {
  window.addEventListener(
    'error',
    (ev: Event) => {
      const img = ev.target;
      if (!(img instanceof HTMLImageElement) || !baseSrcSet) return;
      const url = wanted.get(img);
      if (!url) return;
      const n = recoveries.get(img) || 0;
      if (n >= MAX_RECOVERIES) return;
      let current = '';
      try {
        current = baseSrcGet ? String(baseSrcGet.call(img) || '') : img.getAttribute('src') || '';
      } catch {
        current = img.getAttribute('src') || '';
      }
      const hadCors = img.hasAttribute('crossorigin');
      let next: string | null = null;
      if (current.indexOf('blob:') === 0) {
        forget(url);
        next = url;
      } else if (hadCors) {
        next = url;
      } else {
        const raw = rawWanted.get(img);
        if (raw && raw !== url && current !== raw) next = raw;
      }
      if (!next) return;
      recoveries.set(img, n + 1);
      try {
        if (hadCors) img.removeAttribute('crossorigin');
        ev.stopImmediatePropagation();
        baseSrcSet.call(img, next);
      } catch {
        /* l'erreur suit son cours */
      }
    },
    true
  );
}

function patchImages(): void {
  const proto = HTMLImageElement.prototype;
  const d = Object.getOwnPropertyDescriptor(proto, 'src');
  if (!d || !d.get || !d.set) return;
  const get = d.get;
  const set = d.set;
  baseSrcGet = get as (this: HTMLImageElement) => string;
  baseSrcSet = set as (this: HTMLImageElement, v: string) => void;
  Object.defineProperty(proto, 'src', {
    configurable: true,
    enumerable: d.enumerable,
    get(this: HTMLImageElement) {
      const w = wanted.get(this);
      return w !== undefined ? w : get.call(this);
    },
    set(this: HTMLImageElement, v: unknown) {
      if (isTmdb(v)) {
        applyTmdb(this, v, (x) => set.call(this, x));
        return;
      }
      wanted.delete(this);
      rawWanted.delete(this);
      set.call(this, v);
    },
  });
  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    if ((name === 'src' || name === 'SRC') && this instanceof HTMLImageElement) {
      if (isTmdb(value)) {
        const el = this;
        applyTmdb(el, value, (x) => origSetAttribute.call(el, 'src', x));
        return;
      }
      wanted.delete(this);
      rawWanted.delete(this);
    }
    return origSetAttribute.call(this, name, value);
  };
}

/** URL blob: déjà en mémoire pour cette image (mode « idb »), sinon null. Synchrone. */
export function peekCachedImageUrl(url: string): string | null {
  if (mode !== 'idb' || !isTmdb(url)) return null;
  return memGet(normalizeTmdbUrl(url));
}

/**
 * Pour les images en CSS (background-image), que le patch <img> ne voit pas.
 * Mode « idb » : mémoire → IndexedDB → un seul téléchargement CORS mis en cache ; renvoie une URL blob:.
 * Autres modes (Service Worker web) ou échec : renvoie l'URL d'origine.
 */
export function loadCachedImageUrl(raw: string): Promise<string> {
  if (mode !== 'idb' || !isTmdb(raw)) return Promise.resolve(raw);
  const url = normalizeTmdbUrl(raw);
  const hit = memGet(url);
  if (hit) return Promise.resolve(hit);
  const fromNetwork = (): Promise<string> =>
    fetchImageBlob(url)
      .then((blob) => {
        if (!blob) return url;
        const objectUrl = memPut(url, blob);
        dbPut({ u: url, b: blob, t: Date.now(), s: blob.size });
        return objectUrl;
      })
      .catch(() => url);
  return loadKnownKeys()
    .then(() => (knownKeys && knownKeys.has(url) ? dbGet(url) : null))
    .then((blob) => (blob ? memPut(url, blob) : fromNetwork()))
    .catch(() => url);
}

/** Vide le cache d'images JS (réglages / diagnostic). */
export function clearImageCache(): Promise<void> {
  for (const e of mem.values()) URL.revokeObjectURL(e.url);
  mem.clear();
  memBytes = 0;
  knownKeys = new Set();
  return openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    } catch {
      /* ignore */
    }
  });
}

/** Installe le patch (idempotent). Sans effet en SSR et pendant les tests unitaires. */
export function installImageCache(): ImageCacheMode | 'off' {
  if (installed || typeof window === 'undefined' || typeof HTMLImageElement === 'undefined') return mode;
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITEST) return 'off';
  const detected = detectImageCacheMode();
  if (detected === 'off') return 'off';
  installed = true;
  mode = detected;
  try {
    patchImages();
  } catch {
    return mode;
  }
  try {
    installErrorFallback();
  } catch {
    /* ignore */
  }
  try {
    document.addEventListener('astro:page-load', () => {
      pageRank = 0;
    });
    document.addEventListener('astro:before-swap', () => {
      pageRank = 0;
    });
  } catch {
    /* ignore */
  }
  if (mode === 'idb') void loadKnownKeys();
  try {
    (window as unknown as { __popcornImageCache?: unknown }).__popcornImageCache = {
      mode,
      stats: () => ({ mode, memEntries: mem.size, memBytes, known: knownKeys ? knownKeys.size : null }),
      clear: clearImageCache,
    };
  } catch {
    /* ignore */
  }
  return mode;
}
