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
 * Récupère l'URL du backend
 * 
 * Côté client: lit depuis localStorage, puis env, puis défaut
 * Côté serveur (SSR): lit depuis env, puis défaut (localStorage non disponible)
 */
export function getBackendUrl(): string {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:ENTRY',message:'Récupération URL backend',data:{isServer:typeof window === 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }
  // #endregion
  // Côté serveur (Astro SSR), localStorage n'est pas disponible
  if (typeof window === 'undefined') {
    // Utiliser variable d'environnement ou valeur par défaut
    const result = import.meta.env.BACKEND_URL || 
           import.meta.env.PUBLIC_BACKEND_URL || 
           getDefaultBackendUrl();
    return result;
  }

  // Côté client: priorité localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:LOCALSTORAGE',message:'Lecture localStorage',data:{stored,hasStored:!!stored},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (stored) {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:RETURN_STORED',message:'URL retournée depuis localStorage',data:{stored},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return stored;
    }
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la lecture de localStorage:', error);
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:LOCALSTORAGE_ERROR',message:'Erreur lecture localStorage',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
  }

  // Fallback: variable d'environnement
  const envUrl = import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '';
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:ENV_CHECK',message:'Vérification variables env',data:{envUrl,hasEnvUrl:!!envUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  if (envUrl) {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:RETURN_ENV',message:'URL retournée depuis env',data:{envUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    return envUrl;
  }

  // Valeur par défaut (détecte Android automatiquement)
  const defaultUrl = getDefaultBackendUrl();
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:getBackendUrl:RETURN_DEFAULT',message:'URL retournée par défaut',data:{defaultUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  return defaultUrl;
}

/**
 * Version asynchrone avec détection améliorée Android
 */
export async function getBackendUrlAsync(): Promise<string> {
  // Côté serveur (Astro SSR), localStorage n'est pas disponible
  if (typeof window === 'undefined') {
    // Utiliser variable d'environnement ou valeur par défaut
    return import.meta.env.BACKEND_URL || 
           import.meta.env.PUBLIC_BACKEND_URL || 
           await getDefaultBackendUrlAsync();
  }

  // Côté client: priorité localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la lecture de localStorage:', error);
  }

  // Fallback: variable d'environnement
  if (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL) {
    return import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '';
  }

  // Valeur par défaut avec détection améliorée Android
  return await getDefaultBackendUrlAsync();
}

/**
 * Normalise une URL en ajoutant le protocole si manquant
 */
function normalizeBackendUrl(url: string): string {
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:normalizeBackendUrl:ENTRY',message:'Normalisation URL backend',data:{urlOriginal:url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const trimmed = url.trim();
  if (!trimmed) {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:normalizeBackendUrl:EMPTY',message:'URL vide après trim',data:{urlOriginal:url,trimmed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return trimmed;
  }
  
  // Si l'URL ne commence pas par http:// ou https://, ajouter http://
  const hasProtocol = trimmed.match(/^https?:\/\//i);
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:normalizeBackendUrl:CHECK_PROTOCOL',message:'Vérification protocole',data:{urlOriginal:url,trimmed,hasProtocol:!!hasProtocol},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!hasProtocol) {
    const normalized = `http://${trimmed}`;
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:normalizeBackendUrl:ADD_PROTOCOL',message:'Protocole http:// ajouté',data:{urlOriginal:url,trimmed,normalized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return normalized;
  }
  
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'backend-config.ts:normalizeBackendUrl:EXIT',message:'URL normalisée (protocole déjà présent)',data:{urlOriginal:url,trimmed,normalized:trimmed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return trimmed;
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
