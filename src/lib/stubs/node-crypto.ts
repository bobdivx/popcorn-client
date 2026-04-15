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
    const crypto = require('crypto');
    return crypto.randomBytes(size);
  }
  
  throw new Error('No secure random number generator available.');
}

export default {
  randomBytes,
};
