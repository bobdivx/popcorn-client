/**
 * Stub navigateur pour le builtin Node `crypto`.
 * Vite externalise `crypto` en build static : on n'importe jamais le module Node.
 */

export function randomBytes(size: number): Uint8Array {
  const array = new Uint8Array(size);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
    return array;
  }
  for (let i = 0; i < size; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

export default {
  randomBytes,
};
