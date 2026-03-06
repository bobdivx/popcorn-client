/**
 * Implémentation JWT côté client compatible navigateur et Tauri (Android/Desktop)
 * Utilise Web Crypto API au lieu de jsonwebtoken (Node.js uniquement)
 * 
 * Compatibilité :
 * - ✅ Navigateurs modernes (Chrome, Firefox, Safari, Edge) - HTTPS requis (ou localhost)
 * - ✅ Tauri v2 Android (WebView moderne avec support Web Crypto API) - Contexte sécurisé par défaut
 * - ✅ Tauri Desktop - Contexte sécurisé par défaut
 * 
 * Web Crypto API est disponible dans tous ces environnements via crypto.subtle
 * 
 * Note importante pour Android/Tauri :
 * - Tauri fournit un contexte sécurisé même si l'URL est en HTTP
 * - crypto.subtle est toujours disponible dans Tauri Android/Desktop
 * - Aucune restriction HTTPS nécessaire pour les apps Tauri
 */

// Importer la fonction de détection Tauri pour cohérence
import { isTauri } from '../utils/tauri.js';

// Récupérer le secret JWT de l'utilisateur depuis le stockage local
// Si non trouvé, utiliser le secret d'environnement ou générer un secret temporaire
function getJWTSecretSync(): string {
  // D'abord, essayer de récupérer le secret stocké depuis localStorage (depuis login/register)
  if (typeof window !== 'undefined') {
    try {
      const storedSecret = localStorage.getItem('jwt_secret');
      if (storedSecret) {
        return storedSecret;
      }
    } catch (error) {
      // localStorage peut ne pas être disponible, continuer
    }
  }
  
  // Ensuite, essayer le secret d'environnement
  const envSecret = import.meta.env.JWT_SECRET;
  if (envSecret) {
    return envSecret;
  }
  
  // En mode production, exiger un secret
  if (import.meta.env.PROD) {
    throw new Error('JWT_SECRET must be defined. Please login or register to get your user-specific JWT secret.');
  }
  
  // En développement, générer un secret aléatoire temporaire
  console.warn('⚠️ JWT_SECRET not found. Generating a temporary secret for development. Please login to get your user-specific secret.');
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
const JWT_ACCESS_EXPIRES_IN = import.meta.env.JWT_ACCESS_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = import.meta.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId?: string;
  id?: string;
  username: string;
  isAdmin?: boolean;
  role?: string;
  type?: 'access' | 'refresh';
  exp?: number;
  iat?: number;
}

/**
 * Encode une chaîne en base64url
 */
function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Récupère l'API crypto.subtle disponible selon l'environnement
 * - Navigateurs/Tauri : crypto.subtle
 * - Node.js 15+ : crypto.webcrypto.subtle
 */
function getCryptoSubtle(): SubtleCrypto {
  // Vérifier si on est dans Tauri (Android/Desktop) - Tauri fournit toujours un contexte sécurisé
  const isTauriEnv = isTauri();
  
  // Log pour diagnostic
  if (typeof window !== 'undefined') {
    const protocol = window.location?.protocol;
    const hostname = window.location?.hostname || '';
    console.log('[jwt-client] Contexte:', {
      isTauri: isTauriEnv,
      protocol,
      hostname,
      hasCrypto: typeof crypto !== 'undefined',
      hasCryptoSubtle: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
    });
  }
  
  // Vérifier si on est dans un navigateur/Tauri (crypto.subtle disponible)
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.subtle !== 'undefined' && crypto.subtle !== null) {
      // crypto.subtle est disponible, on peut l'utiliser
      return crypto.subtle;
    }
    
    // crypto.subtle n'est pas disponible
    // Si on est dans Tauri, c'est anormal (Tauri devrait toujours fournir crypto.subtle)
    if (isTauriEnv) {
      // Dans Tauri, crypto.subtle devrait toujours être disponible
      // Si ce n'est pas le cas, c'est peut-être un problème de timing ou de configuration
      console.error('[jwt-client] ⚠️ Tauri détecté mais crypto.subtle n\'est pas disponible. Cela peut indiquer un problème de configuration ou de timing.');
      // On lance quand même une erreur car sans crypto.subtle, on ne peut pas générer de tokens
      throw new Error(
        'Web Crypto API (crypto.subtle) is not available in Tauri environment. ' +
        'This is unexpected as Tauri should always provide a secure context. ' +
        'Please check your Tauri configuration and ensure you are using a recent version of Tauri.'
      );
    }
    
    // Si on n'est PAS dans Tauri (navigateur web/Docker), vérifier le contexte de sécurité
    if (typeof window !== 'undefined') {
      const protocol = window.location?.protocol;
      const hostname = window.location?.hostname || '';
      
      // Vérifier si c'est HTTP (pas HTTPS) et pas localhost
      if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // Détecter si c'est une adresse IP locale ou un domaine .local
        const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
        const isLocalDomain = hostname.endsWith('.local');
        
        console.error('[jwt-client] ⚠️ Web Crypto API bloquée:', {
          protocol,
          hostname,
          isLocalIP,
          isLocalDomain,
          reason: 'Les navigateurs modernes bloquent crypto.subtle en HTTP (sauf localhost)',
        });
        
        if (isLocalIP || isLocalDomain) {
          // C'est une adresse locale mais le navigateur bloque quand même crypto.subtle en HTTP
          throw new Error(
            `Web Crypto API is blocked by the browser when using HTTP (even for local addresses). ` +
            `Current URL: ${protocol}//${hostname}${window.location?.port ? ':' + window.location.port : ''} ` +
            `\n\n⚠️ Ce n'est PAS un problème CORS, mais une restriction de sécurité du navigateur.` +
            `\n\nSolutions for Docker/Web browser:` +
            `\n1. Use HTTPS (recommended): Configure a reverse proxy (nginx/traefik) with SSL certificate` +
            `\n2. Use localhost: Access via http://localhost:PORT instead of the IP/domain` +
            `\n3. For development: Some browsers allow HTTP on localhost, try http://localhost:PORT` +
            `\n\nNote: Tauri apps (Android/Desktop) work with HTTP because they provide a secure context by default.`
          );
        } else {
          throw new Error(
            'Web Crypto API requires HTTPS or localhost in browser environments. ' +
            `Current protocol: ${protocol}, hostname: ${hostname}. ` +
            `\n\n⚠️ Ce n'est PAS un problème CORS, mais une restriction de sécurité du navigateur.` +
            `\n\nSolutions:` +
            `\n1. Use HTTPS: Configure SSL certificate for your domain` +
            `\n2. Use localhost: Access via http://localhost:PORT` +
            `\n3. Use Tauri app: Tauri provides secure context even with HTTP`
          );
        }
      }
    }
  }
  
  // Vérifier si on est dans Node.js (crypto.webcrypto.subtle disponible depuis Node.js 15+)
  if (typeof globalThis !== 'undefined') {
    const nodeCrypto = (globalThis as any).crypto;
    if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
      return nodeCrypto.webcrypto.subtle;
    }
  }
  
  // Essayer d'importer le module crypto de Node.js si disponible
  try {
    // @ts-ignore - Peut ne pas être disponible dans tous les environnements
    const nodeCrypto = require('crypto');
    if (nodeCrypto && nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
      return nodeCrypto.webcrypto.subtle;
    }
  } catch {
    // Module crypto non disponible, continuer
  }
  
  // Message d'erreur détaillé selon l'environnement
  const envInfo = typeof window !== 'undefined' 
    ? 'navigateur' 
    : typeof globalThis !== 'undefined' 
    ? 'Node.js' 
    : 'inconnu';
  
  const cryptoInfo = typeof crypto !== 'undefined' 
    ? `crypto.subtle=${typeof crypto.subtle}` 
    : 'crypto=undefined';
  
  throw new Error(
    `Web Crypto API is not available in this ${envInfo} environment. ` +
    `This code requires: ` +
    `- A modern browser with HTTPS (or localhost), ` +
    `- Tauri environment, ` +
    `- Or Node.js 15+ with crypto.webcrypto.subtle support. ` +
    `Current: ${cryptoInfo}`
  );
}

/**
 * Vérifie si Web Crypto API est disponible
 * Nécessaire pour Tauri, navigateurs et Node.js 15+
 */
function isWebCryptoAvailable(): boolean {
  try {
    getCryptoSubtle();
    return true;
  } catch {
    return false;
  }
}

/**
 * Crée un HMAC SHA-256 signature
 * Utilise Web Crypto API (disponible dans navigateurs, Tauri Android/Desktop, et Node.js 15+)
 */
async function createSignature(header: string, payload: string, secret: string): Promise<string> {
  // Récupérer l'API crypto.subtle selon l'environnement
  const subtle = getCryptoSubtle();

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  // Import la clé pour HMAC
  const key = await subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Signe les données
  const data = encoder.encode(`${header}.${payload}`);
  const signature = await subtle.sign('HMAC', key, data);
  
  // Convertit en base64url
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return base64UrlEncode(signatureBase64);
}

/**
 * Calcule l'expiration en secondes depuis maintenant
 */
function getExpirationSeconds(expiresIn: string): number {
  const now = Math.floor(Date.now() / 1000);
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return now + 3600; // Par défaut 1h
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return now + value;
    case 'm': return now + value * 60;
    case 'h': return now + value * 3600;
    case 'd': return now + value * 86400;
    default: return now + 3600;
  }
}

/**
 * Génère un token JWT côté client (compatible navigateur)
 * Utilise le secret JWT de l'utilisateur stocké localement
 * 
 * ⚠️ Cette fonction ne doit être appelée que côté client (navigateur/Tauri)
 * Ne pas appeler en SSR (Server-Side Rendering)
 */
export async function generateAccessToken(payload: Omit<JWTPayload, 'type' | 'exp' | 'iat'>): Promise<string> {
  // Vérifier qu'on est dans un contexte client (pas SSR)
  // En SSR, window est undefined, donc on ne peut pas générer de tokens
  if (typeof window === 'undefined') {
    throw new Error('generateAccessToken can only be called in a client context (browser or Tauri). It cannot be called during SSR.');
  }
  
  const jwtSecret = getJWTSecretSync();
  
  const normalizedPayload: JWTPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'access',
    iat: Math.floor(Date.now() / 1000),
    exp: getExpirationSeconds(JWT_ACCESS_EXPIRES_IN),
  };
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerBase64 = base64UrlEncode(JSON.stringify(header));
  const payloadBase64 = base64UrlEncode(JSON.stringify(normalizedPayload));
  
  const signature = await createSignature(headerBase64, payloadBase64, jwtSecret);
  
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * Génère un token de rafraîchissement (longue durée)
 * Utilise le secret JWT de l'utilisateur stocké localement
 * 
 * ⚠️ Cette fonction ne doit être appelée que côté client (navigateur/Tauri)
 * Ne pas appeler en SSR (Server-Side Rendering)
 */
export async function generateRefreshToken(payload: Omit<JWTPayload, 'type' | 'exp' | 'iat'>): Promise<string> {
  // Vérifier qu'on est dans un contexte client (pas SSR)
  // En SSR, window est undefined, donc on ne peut pas générer de tokens
  if (typeof window === 'undefined') {
    throw new Error('generateRefreshToken can only be called in a client context (browser or Tauri). It cannot be called during SSR.');
  }
  
  const jwtSecret = getJWTSecretSync();
  
  const normalizedPayload: JWTPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000),
    exp: getExpirationSeconds(JWT_REFRESH_EXPIRES_IN),
  };
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerBase64 = base64UrlEncode(JSON.stringify(header));
  const payloadBase64 = base64UrlEncode(JSON.stringify(normalizedPayload));
  
  const signature = await createSignature(headerBase64, payloadBase64, jwtSecret);
  
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
