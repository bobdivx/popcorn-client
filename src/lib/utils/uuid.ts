// Utiliser Web Crypto API pour compatibilité Tauri
// Fallback sur crypto Node.js si disponible (routes API uniquement)

function getRandomBytes(size: number): Uint8Array {
  // Utiliser Web Crypto API (compatible Tauri)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(size);
    window.crypto.getRandomValues(array);
    return array;
  }
  
  // Fallback sur crypto Node.js (routes API uniquement)
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const crypto = require('crypto');
      return crypto.randomBytes(size);
    } catch {
      // Si crypto n'est pas disponible, utiliser Math.random
    }
  }
  
  // Fallback ultime : générer des valeurs pseudo-aléatoires
  const array = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(): string {
  return uint8ArrayToHex(getRandomBytes(16));
}

export function generateInviteCode(): string {
  return uint8ArrayToHex(getRandomBytes(8)).toUpperCase();
}

/**
 * Génère un UUID v4 de manière sécurisée.
 * Utilise l'API standard crypto.randomUUID() si disponible, sinon fallback
 * sur une génération basée sur la Web Crypto API.
 */
export function randomUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Node.js fallback
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const crypto = require('crypto');
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // Ignore
    }
  }

  // Generate a standard UUID v4 format using getRandomBytes
  const bytes = getRandomBytes(16);
  // Set version to 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant to RFC4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = uint8ArrayToHex(bytes);
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}
