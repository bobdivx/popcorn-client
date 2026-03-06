/**
 * Gestion de la configuration de l'URL du backend Rust
 * 
 * Stockage dans localStorage (côté client uniquement)
 * Pour les routes API Astro (SSR), utiliser les variables d'environnement
 * 
 * Priorité de récupération:
 * 1. localStorage (côté client uniquement)
 * 2. Variable d'environnement BACKEND_URL (dev/prod)
 * 3. Valeur par défaut:
 *    - Android: http://10.0.2.2:3000 (adresse spéciale émulateur pour accéder à localhost de l'hôte)
 *    - Autres: http://127.0.0.1:3000
 */

const STORAGE_KEY = 'popcorn_backend_url';
/** URL du "mon serveur" (pour la page Bibliothèque : toujours afficher ma bibliothèque + celle des amis) */
const MY_BACKEND_STORAGE_KEY = 'popcorn_my_backend_url';
const DEMO_MODE_STORAGE_KEY = 'popcorn_demo_mode';

/**
 * Détecte si on est sur Android (via Tauri ou UserAgent)
 */
async function isAndroidPlatform(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Essayer d'abord via Tauri (plus fiable)
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const platform = await invoke<string>('get-platform').catch(() => null);
    if (platform === 'android') {
      return true;
    }
  } catch {
    // Tauri non disponible, continuer avec UserAgent
  }
  
  // Fallback: détection via UserAgent
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua);
}

/**
 * Détecte si on est sur un émulateur Android
 * L'émulateur utilise toujours 10.0.2.2 pour accéder à localhost de l'hôte
 * 
 * Note: 10.0.2.2 ne fonctionne QUE sur l'émulateur, pas sur appareil physique.
 * Sur appareil physique, l'utilisateur doit utiliser l'IP locale de sa machine.
 */
function isAndroidEmulator(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Détection basique: vérifier si on est sur un émulateur
  // Les émulateurs ont souvent certains patterns dans le UserAgent
  const ua = navigator.userAgent || '';
  
  // Patterns d'émulateur Android
  if (/sdk/i.test(ua) || /Emulator/i.test(ua) || /Android SDK/i.test(ua)) {
    return true;
  }
  
  // Par défaut, on assume que c'est un appareil physique
  // L'utilisateur devra configurer l'IP manuellement
  return false;
}

/**
 * Retourne l'URL backend par défaut selon la plateforme
 */
async function getDefaultBackendUrlAsync(): Promise<string> {
  const isAndroid = await isAndroidPlatform();
  if (isAndroid) {
    // Vérifier si c'est un émulateur
    const isEmulator = isAndroidEmulator();
    if (isEmulator) {
      // Sur émulateur, 10.0.2.2 fonctionne pour accéder au localhost de l'hôte
      return 'http://10.0.2.2:3000';
    } else {
      // Sur appareil physique, pas de valeur par défaut valide
      // L'utilisateur devra configurer l'IP locale de sa machine
      // On retourne quand même une valeur pour éviter les erreurs, mais elle ne fonctionnera pas
      // L'utilisateur sera redirigé vers /setup pour configurer
      return 'http://10.0.2.2:3000'; // Ne fonctionnera pas, mais forcera la configuration
    }
  }
  return 'http://127.0.0.1:3000';
}

/**
 * Version synchrone (pour compatibilité)
 * Utilise la détection UserAgent comme fallback
 */
function getDefaultBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    if (isAndroid) {
      // Vérifier si c'est un émulateur (détection basique)
      const isEmulator = /sdk/i.test(ua) || /Emulator/i.test(ua) || /Android SDK/i.test(ua);
      if (isEmulator) {
        return 'http://10.0.2.2:3000';
      } else {
        // Appareil physique: retourner quand même 10.0.2.2 (ne fonctionnera pas)
        // mais cela forcera l'utilisateur à configurer via /setup
        return 'http://10.0.2.2:3000';
      }
    }
  }
  return 'http://127.0.0.1:3000';
}

/**
 * Indique si l'application tourne en mode démo (URL /demo ou env ou flag localStorage).
 * En mode démo, pas de setup/login et les fonctionnalités sont simulées.
 */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') {
    return !!(import.meta.env.VITE_DEMO_BACKEND_URL || import.meta.env.PUBLIC_DEMO_BACKEND_URL);
  }
  const path = window.location.pathname || '';
  if (path === '/demo' || path.startsWith('/demo/')) {
    return true;
  }
  if (localStorage.getItem(DEMO_MODE_STORAGE_KEY) === '1') {
    return true;
  }
  const demoUrl = (import.meta.env.VITE_DEMO_BACKEND_URL || import.meta.env.PUBLIC_DEMO_BACKEND_URL || '').trim();
  return !!demoUrl;
}

/**
 * Active le mode démo (stocke le flag en localStorage).
 */
export function setDemoMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Récupère l'URL du backend
 * 
 * Côté client: lit depuis localStorage, puis env, puis défaut
 * Côté serveur (SSR): lit depuis env, puis défaut (localStorage non disponible)
 */
export function getBackendUrl(): string {
  // Côté serveur (Astro SSR), localStorage n'est pas disponible
  if (typeof window === 'undefined') {
    const result = import.meta.env.BACKEND_URL ||
           import.meta.env.PUBLIC_BACKEND_URL ||
           import.meta.env.VITE_DEMO_BACKEND_URL ||
           import.meta.env.PUBLIC_DEMO_BACKEND_URL ||
           getDefaultBackendUrl();
    return (result || '').trim().replace(/\/$/, '') || getDefaultBackendUrl();
  }

  // Côté client: priorité aux variables d'environnement (pour déploiements Docker/CasaOS/NAS)
  // SAUF si l'env pointe vers un autre domaine que la page : ne jamais l'utiliser (même sans localStorage).
  // Sans config stockée, on renvoie l'URL par défaut (ex. 127.0.0.1:3000) pour éviter d'appeler l'origine du client (404).
  const envUrl = (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (envUrl && typeof window !== 'undefined') {
    try {
      const envHost = new URL(envUrl).hostname;
      if (envHost !== window.location.hostname) {
        // Build partagé (ex. URL d'un ami figée au build) : ne jamais utiliser cette URL sur ce déploiement
        const stored = localStorage.getItem(STORAGE_KEY)?.trim().replace(/\/$/, '');
        if (stored) return stored;
        return getDefaultBackendUrl();
      }
      return envUrl;
    } catch {
      // URL env invalide
    }
  }
  if (envUrl) {
    return envUrl;
  }

  // Fallback: localStorage (pour configuration manuelle utilisateur)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const trimmed = stored.trim().replace(/\/$/, '');
      if (trimmed && trimmed.startsWith('http')) return trimmed;
      return trimmed || stored;
    }
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la lecture de localStorage:', error);
  }

  // Backend de validation (stores webOS / Android / Apple) : pas de mention « démo » dans l’UI
  const demoUrl = (import.meta.env.VITE_DEMO_BACKEND_URL || import.meta.env.PUBLIC_DEMO_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (demoUrl) {
    return demoUrl;
  }

  // Valeur par défaut (détecte Android automatiquement)
  const defaultUrl = getDefaultBackendUrl();
  return defaultUrl;
}

/**
 * Version asynchrone avec détection améliorée Android
 */
export async function getBackendUrlAsync(): Promise<string> {
  // Côté serveur (Astro SSR), localStorage n'est pas disponible
  if (typeof window === 'undefined') {
    const result = import.meta.env.BACKEND_URL ||
           import.meta.env.PUBLIC_BACKEND_URL ||
           import.meta.env.VITE_DEMO_BACKEND_URL ||
           import.meta.env.PUBLIC_DEMO_BACKEND_URL ||
           (await getDefaultBackendUrlAsync());
    return (result || '').trim().replace(/\/$/, '') || (await getDefaultBackendUrlAsync());
  }

  // Côté client: même règle (ne jamais utiliser une URL env d'un autre domaine)
  const envUrlAsync = (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (envUrlAsync && typeof window !== 'undefined') {
    try {
      const envHost = new URL(envUrlAsync).hostname;
      if (envHost !== window.location.hostname) {
        const stored = localStorage.getItem(STORAGE_KEY)?.trim().replace(/\/$/, '');
        if (stored) return stored;
        return await getDefaultBackendUrlAsync();
      }
      return envUrlAsync;
    } catch {
      // ignore
    }
  }
  if (envUrlAsync) {
    return envUrlAsync;
  }

  // Fallback: localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const trimmed = stored.trim().replace(/\/$/, '');
      if (trimmed && trimmed.startsWith('http')) return trimmed;
      return trimmed || stored;
    }
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la lecture de localStorage:', error);
  }

  // Backend de validation (stores webOS / Android / Apple)
  const demoUrlAsync = (import.meta.env.VITE_DEMO_BACKEND_URL || import.meta.env.PUBLIC_DEMO_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (demoUrlAsync) {
    return demoUrlAsync;
  }

  // Valeur par défaut avec détection améliorée Android
  return await getDefaultBackendUrlAsync();
}

/**
 * Normalise une URL backend :
 * - Ajoute http:// si manquant
 * - Pour localhost/127.0.0.1/0.0.0.0 sans port (ou port 80), ajoute :3000
 * - Remplace 0.0.0.0 par 127.0.0.1 (on ne peut pas se connecter à 0.0.0.0 depuis un client)
 */
function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }

  let normalized = trimmed;
  if (!trimmed.match(/^https?:\/\//i)) {
    normalized = `http://${trimmed}`;
  }

  try {
    const urlObj = new URL(normalized);
    const host = urlObj.hostname.toLowerCase();
    const port = urlObj.port || '';

    // 0.0.0.0 est une adresse d'écoute serveur, pas de connexion client
    if (host === '0.0.0.0') {
      urlObj.hostname = '127.0.0.1';
    }

    // localhost / 127.0.0.1 sans port ou port 80 → utiliser le port 3000 par défaut du backend
    if ((host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') && (port === '' || port === '80')) {
      urlObj.port = '3000';
    }

    return urlObj.toString().replace(/\/$/, '');
  } catch {
    return normalized;
  }
}

export interface SetBackendUrlOptions {
  /** Si true (défaut), enregistre aussi cette URL comme "mon serveur" (pour la page Bibliothèque). Mettre à false quand on bascule vers le serveur d'un ami. */
  setAsMyBackend?: boolean;
}

/**
 * Définit l'URL du backend dans localStorage (côté client uniquement).
 * Par défaut, enregistre aussi comme "mon serveur" pour que la page Bibliothèque affiche toujours ma bibliothèque.
 * Utiliser setAsMyBackend: false quand on bascule vers le serveur d'un ami (ex. clic sur un média partagé).
 */
export function setBackendUrl(url: string, options?: SetBackendUrlOptions): void {
  if (typeof window === 'undefined') {
    console.warn('[backend-config] setBackendUrl appelé côté serveur, ignoré');
    return;
  }

  try {
    // Normaliser l'URL (ajouter http:// si manquant)
    const normalizedUrl = normalizeBackendUrl(url);
    
    // Valider l'URL avant de la stocker
    try {
      const urlObj = new URL(normalizedUrl);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error('Le protocole doit être http:// ou https://');
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
      }
      throw e;
    }

    localStorage.setItem(STORAGE_KEY, normalizedUrl);
    if (options?.setAsMyBackend !== false) {
      localStorage.setItem(MY_BACKEND_STORAGE_KEY, normalizedUrl);
    }
  } catch (error) {
    console.error('[backend-config] Erreur lors de la sauvegarde dans localStorage:', error);
    throw error;
  }
}

/**
 * Retourne l'URL du "mon serveur" (celle utilisée pour afficher ma bibliothèque sur la page Bibliothèque).
 * Si jamais définie, retourne null : la page Bibliothèque utilisera alors l'URL courante ou la config cloud.
 */
export function getMyBackendUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(MY_BACKEND_STORAGE_KEY);
    return stored && stored.trim() !== '' ? stored.trim().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre uniquement l'URL "mon serveur" sans modifier le backend courant.
 * Utile quand on récupère "mon serveur" depuis la config cloud.
 */
export function setMyBackendUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = url.trim().replace(/\/$/, '');
    if (normalized) {
      localStorage.setItem(MY_BACKEND_STORAGE_KEY, normalized);
    }
  } catch {
    // ignore
  }
}

/**
 * Supprime l'URL du backend de localStorage
 */
export function clearBackendUrl(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la suppression de localStorage:', error);
  }
}

/**
 * Supprime toutes les données backend du localStorage (URL, "mon serveur", mode démo).
 * Utilisé au démarrage du wizard setup pour repartir de zéro.
 */
export function clearAllBackendStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MY_BACKEND_STORAGE_KEY);
    localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  } catch (error) {
    console.warn('[backend-config] Erreur lors du nettoyage localStorage:', error);
  }
}

/**
 * Vérifie si une URL du backend est configurée PAR L'UTILISATEUR
 * 
 * IMPORTANT: Cette fonction doit retourner true SEULEMENT si l'utilisateur a configuré l'URL
 * (via localStorage). Les env vars sont des fallbacks pour getBackendUrl(), pas des "configurations".
 * 
 * Si hasBackendUrl() retourne false, l'app doit rediriger vers /setup (premier démarrage).
 */
export function hasBackendUrl(): boolean {
  if (typeof window === 'undefined') {
    // Côté serveur: considérer comme non configuré (le setup n'existe qu'en client)
    return false;
  }

  try {
    // Côté client: retourner true SEULEMENT si localStorage contient une valeur
    // (env vars = fallback, pas une "configuration utilisateur")
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null && stored.trim() !== '';
  } catch (error) {
    // Si localStorage n'est pas accessible, considérer comme non configuré
    console.warn('[backend-config] hasBackendUrl: localStorage access failed:', error);
    return false;
  }
}

/**
 * Port effectif d'une URL (80 pour http sans port, 443 pour https sans port).
 */
function getEffectivePort(url: URL): number {
  if (url.port && url.port !== '') {
    const p = parseInt(url.port, 10);
    if (!Number.isNaN(p)) return p;
  }
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Indique si l'URL backend fournie est exactement la même que l'origine de la page (client).
 * Compare hostname et port effectif (port absent = 80 pour http, 443 pour https).
 * Utile pour demander confirmation à l'utilisateur quand client et serveur API ont la même adresse.
 */
export function isBackendUrlSameAsClientUrl(backendUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const trimmed = (backendUrl || '').trim().replace(/\/$/, '');
  if (!trimmed || !trimmed.startsWith('http')) return false;
  try {
    const backend = new URL(trimmed);
    const client = new URL(window.location.origin);
    if (backend.protocol !== client.protocol) return false;
    if (backend.hostname.toLowerCase() !== client.hostname.toLowerCase()) return false;
    return getEffectivePort(backend) === getEffectivePort(client);
  } catch {
    return false;
  }
}

/**
 * Retourne l'URL configurée dans localStorage (pour diagnostic)
 */
export function getConfiguredBackendUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[backend-config] getConfiguredBackendUrl: localStorage access failed:', error);
    return null;
  }
}

const RUNTIME_BACKEND_FLAG = 'popcorn_backend_from_runtime';

/**
 * Indique si le backend est fixé par le déploiement (env, config.json ou même origine).
 * Dans ce cas, la config cloud ne doit pas écraser l'URL backend.
 */
export function hasDeploymentBackend(): boolean {
  if (typeof window === 'undefined') return false;
  if ((import.meta.env.PUBLIC_BACKEND_URL || import.meta.env.BACKEND_URL || '').trim()) return true;
  try {
    if (sessionStorage.getItem(RUNTIME_BACKEND_FLAG)) return true;
    // Backend sur la même origine (ex. popcorn.briseteia.me) = déploiement dédié, ne pas écraser
    const url = getBackendUrl();
    if (url?.startsWith('http')) {
      const host = new URL(url).hostname;
      if (host === window.location.hostname) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Charge la config runtime (ex. /config.json en Docker) et met à jour l'URL backend si présente.
 * À appeler au démarrage de l'app pour que les déploiements Docker avec PUBLIC_BACKEND_URL
 * fonctionnent sans passer par /setup.
 * Retourne { urlChanged: true } si l'URL a changé (appelant doit invalider la session : tokens / user).
 */
export function loadRuntimeConfig(): Promise<{ urlChanged: boolean }> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ urlChanged: false });
  }

  const previousUrl = getConfiguredBackendUrl()?.trim().replace(/\/$/, '') ?? null;

  return fetch('/config.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { backendUrl?: string } | null) => {
      if (data && typeof data.backendUrl === 'string' && data.backendUrl.trim()) {
        const url = data.backendUrl.trim();
        try {
          setBackendUrl(url);
          try {
            sessionStorage.setItem(RUNTIME_BACKEND_FLAG, '1');
          } catch {
            // ignore
          }
          const newUrl = getConfiguredBackendUrl()?.trim().replace(/\/$/, '') ?? null;
          const urlChanged = previousUrl !== newUrl;
          return { urlChanged };
        } catch {
          // ignore invalid URL
          return { urlChanged: false };
        }
      }
      return { urlChanged: false };
    })
    .catch(() => {
      // Pas de config.json (normal hors Docker) ou erreur réseau : ignorer
      return { urlChanged: false };
    });
}