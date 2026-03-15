export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const STORAGE_KEY = 'popcorn_device_id';
  
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    const timestamp = Date.now();
    let random: string;
    if (window.crypto && window.crypto.randomUUID) {
      random = window.crypto.randomUUID().split('-')[0];
    } else if (window.crypto && window.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      random = array[0].toString(36);
    } else {
      throw new Error("No secure random number generator available");
    }
    const userAgent = navigator.userAgent.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    deviceId = `${timestamp}-${random}-${userAgent}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
}
