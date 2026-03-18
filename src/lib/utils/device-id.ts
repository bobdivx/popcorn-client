export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const STORAGE_KEY = 'popcorn_device_id';
  
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    const timestamp = Date.now();

    // Secure random generation
    let randomHex = '';
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      const array = new Uint8Array(8);
      globalThis.crypto.getRandomValues(array);
      randomHex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Very last fallback if no crypto is available (e.g. ancient browser)
      // Though in modern context, Web Crypto is everywhere.
      throw new Error('No secure random number generator available.');
    }

    const userAgent = navigator.userAgent.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    deviceId = `${timestamp}-${randomHex}-${userAgent}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
}
