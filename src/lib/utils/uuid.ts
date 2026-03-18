// Utiliser Web Crypto API pour compatibilité Tauri
// Fallback sur crypto Node.js si disponible (routes API uniquement)

function getRandomBytes(size: number): Uint8Array {
  // Prioritize globalThis.crypto (Web Crypto API)
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }

  // Verify typeof crypto !== 'undefined' for SSR
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(size);
    crypto.getRandomValues(array);
    return array;
  }
  
  // Fallback sur crypto Node.js (routes API uniquement)
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const nodeCrypto = require('crypto');
      return nodeCrypto.randomBytes(size);
    } catch {
      // ignore
    }
  }
  
  // Throw an error instead of using insecure Math.random()
  throw new Error('No secure random number generator available.');
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
