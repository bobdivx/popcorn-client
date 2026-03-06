/**
 * Stub pour le module crypto de Node.js
 * Utilisé uniquement pour éviter les erreurs d'import dans Tauri
 * Les routes API qui utilisent vraiment crypto sont exclues du build Tauri
 */

export function randomBytes(size: number): Uint8Array {
  // Utiliser Web Crypto API à la place
  if (typeof window !== 'undefined' && window.crypto) {
    const array = new Uint8Array(size);
    window.crypto.getRandomValues(array);
    return array;
  }
  
  // Fallback pour Node.js (ne devrait jamais arriver dans Tauri)
  if (typeof process !== 'undefined' && process.versions?.node) {
    const crypto = require('crypto');
    return crypto.randomBytes(size);
  }
  
  // Fallback ultime : générer des valeurs pseudo-aléatoires
  const array = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

export default {
  randomBytes,
};
