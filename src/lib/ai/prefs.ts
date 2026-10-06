import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../client/server-api';

const KEY = 'popcorn_ai_enabled';
const EVENT = 'popcorn-ai-enabled';

export function isAiEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(KEY);
  if (raw === null) return true;
  return raw === '1';
}

export function setAiEnabled(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0');
  healthCache = null;
  window.dispatchEvent(new Event(EVENT));
}

export function useAiEnabled(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(isAiEnabled());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return on;
}

let healthCache: Promise<boolean> | null = null;

export function resetAiReadyCache() {
  healthCache = null;
}

/** Vrai quand l'utilisateur a laissé les suggestions et que le serveur répond. */
export function aiReady(): Promise<boolean> {
  if (!isAiEnabled()) return Promise.resolve(false);
  if (!healthCache) {
    healthCache = serverApi
      .aiHealth()
      .then((res) => !!(res.success && res.data?.ok))
      .catch(() => false);
  }
  return healthCache;
}
