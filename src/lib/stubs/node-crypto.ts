/**
 * Stub pour le module crypto de Node.js
 * Utilisé uniquement pour éviter les erreurs d'import dans Tauri
 * Les routes API qui utilisent vraiment crypto sont exclues du build Tauri
 */

export function randomBytes(size: number): Uint8Array {
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
  
  // Fallback pour Node.js (ne devrait jamais arriver dans Tauri)
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

export default {
  randomBytes,
};
