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

  // Fallback if randomUUID is not natively supported
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    // We use a cryptographically secure random value if available
    const randomArray = new Uint8Array(1);
    let r = 0;
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(randomArray);
      r = randomArray[0] % 16;
    } else {
      // Fallback only if no crypto is available
      r = (Math.random() * 16) | 0;
    }
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return id;
}
