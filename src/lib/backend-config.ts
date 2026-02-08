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

  // Côté client: priorité aux variables d'environnement (pour déploiements Docker/CasaOS)
  // PUBLIC_BACKEND_URL est prioritaire car elle est définie au build/déploiement
  const envUrl = import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '';
  if (envUrl) {
    return envUrl;
  }

  // Fallback: localStorage (pour configuration manuelle utilisateur)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
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

  // Côté client: priorité aux variables d'environnement (pour déploiements Docker/CasaOS)
  // PUBLIC_BACKEND_URL est prioritaire car elle est définie au build/déploiement
  if (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL) {
    return import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '';
  }

  // Fallback: localStorage (pour configuration manuelle utilisateur)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
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

/**
 * Définit l'URL du backend dans localStorage (côté client uniquement)
 */
export function setBackendUrl(url: string): void {
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
    console.log('[backend-config] URL backend sauvegardée:', normalizedUrl);
  } catch (error) {
    console.error('[backend-config] Erreur lors de la sauvegarde dans localStorage:', error);
    throw error;
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

/**
 * Charge la config runtime (ex. /config.json en Docker) et met à jour l'URL backend si présente.
 * À appeler au démarrage de l'app pour que les déploiements Docker avec PUBLIC_BACKEND_URL
 * fonctionnent sans passer par /setup.
 */
export function loadRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return fetch('/config.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { backendUrl?: string } | null) => {
      if (data && typeof data.backendUrl === 'string' && data.backendUrl.trim()) {
        const url = data.backendUrl.trim();
        try {
          setBackendUrl(url);
        } catch {
          // ignore invalid URL
        }
      }
    })
    .catch(() => {
      // Pas de config.json (normal hors Docker) ou erreur réseau : ignorer
    });
}