export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const STORAGE_KEY = 'popcorn_device_id';
  
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const userAgent = navigator.userAgent.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    deviceId = `${timestamp}-${random}-${userAgent}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
}
