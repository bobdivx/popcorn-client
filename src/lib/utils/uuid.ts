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

export function randomUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for environments where crypto.randomUUID is not available
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  const hex = uint8ArrayToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
