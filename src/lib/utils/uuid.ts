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
      // Si crypto n'est pas disponible, lancer une erreur de sécurité
    }
  }
  
  // Si aucune source sécurisée n'est disponible, on refuse de générer
  // une valeur aléatoire faible, afin d'éviter une faille de sécurité.
  throw new Error("Aucune source sécurisée de génération de nombres aléatoires n'est disponible.");
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
