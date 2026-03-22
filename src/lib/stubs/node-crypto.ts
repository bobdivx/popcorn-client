/**
 * Stub pour le module crypto de Node.js
 * Utilisé uniquement pour éviter les erreurs d'import dans Tauri
 * Les routes API qui utilisent vraiment crypto sont exclues du build Tauri
 */

export function randomBytes(size: number): Uint8Array {
  // Utiliser Web Crypto API à la place
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }
  
  // Fallback pour Node.js (ne devrait jamais arriver dans Tauri)
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const crypto = require('crypto');
      return crypto.randomBytes(size);
    } catch {
      // Ignorer l'erreur pour fallback
    }
  }
  
  // Refuser d'utiliser Math.random pour des raisons de sécurité
  throw new Error('No cryptographically secure PRNG available. Refusing to fallback to Math.random() for security reasons.');
}

export default {
  randomBytes,
};
