/**
 * Implémentation JWT côté client compatible navigateur et Tauri (Android/Desktop)
 * Utilise Web Crypto API au lieu de jsonwebtoken (Node.js uniquement)
 * 
 * Compatibilité :
 * - ✅ Navigateurs modernes (Chrome, Firefox, Safari, Edge)
 * - ✅ Tauri v2 Android (WebView moderne avec support Web Crypto API)
 * - ✅ Tauri Desktop
 * 
 * Web Crypto API est disponible dans tous ces environnements via crypto.subtle
 */

const JWT_SECRET = import.meta.env.JWT_SECRET || 'default-secret-change-in-production';
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
 * Vérifie si Web Crypto API est disponible
 * Nécessaire pour Tauri et navigateurs
 */
function isWebCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         crypto.subtle !== null;
}

/**
 * Crée un HMAC SHA-256 signature
 * Utilise Web Crypto API (disponible dans navigateurs et Tauri Android/Desktop)
 */
async function createSignature(header: string, payload: string, secret: string): Promise<string> {
  // Vérifier que Web Crypto API est disponible
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available. This code requires a modern browser or Tauri environment.');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  // Import la clé pour HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Signe les données
  const data = encoder.encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  
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
 */
export async function generateAccessToken(payload: Omit<JWTPayload, 'type' | 'exp' | 'iat'>): Promise<string> {
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
  
  const signature = await createSignature(headerBase64, payloadBase64, JWT_SECRET);
  
  return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * Génère un token de rafraîchissement (longue durée)
 */
export async function generateRefreshToken(payload: Omit<JWTPayload, 'type' | 'exp' | 'iat'>): Promise<string> {
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
  
  const signature = await createSignature(headerBase64, payloadBase64, JWT_SECRET);
  
  return `${headerBase64}.${payloadBase64}.${signature}`;
}
