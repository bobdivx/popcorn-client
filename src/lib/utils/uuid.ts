// Utiliser Web Crypto API pour compatibilité Tauri
// Fallback sur crypto Node.js si disponible (routes API uniquement)

function getRandomBytes(size: number): Uint8Array {
  // Utiliser Web Crypto API (compatible Tauri)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }
  
  // Fallback sur crypto Node.js (routes API uniquement)
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const crypto = require('crypto');
      return crypto.randomBytes(size);
    } catch {
      // Ignorer l'erreur pour fallback sur l'erreur ci-dessous
    }
  }
  
  // Refuser d'utiliser Math.random pour des raisons de sécurité
  throw new Error('No cryptographically secure PRNG available. Refusing to fallback to Math.random() for security reasons.');
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
