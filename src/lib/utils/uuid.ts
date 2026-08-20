function getCrypto(): Crypto | undefined {
  return globalThis.crypto;
}

function getRandomBytes(size: number): Uint8Array {
  const array = new Uint8Array(size);
  const webCrypto = getCrypto();
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(array);
    return array;
  }

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
  const webCrypto = getCrypto();
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = getRandomBytes(1)[0] % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
