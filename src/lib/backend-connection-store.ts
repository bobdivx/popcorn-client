/**
 * Store unifié du statut de connexion au backend (serveur principal).
 * Une seule source de vérité : mise à jour par les échecs API (ConnectionError/Timeout)
 * et par les health checks explicites. Consommée par BackendOfflineBanner, BackendStatusBadge, etc.
 */

import { serverApi } from './client/server-api';
import { getBackendUrl, getMyBackendUrl } from './backend-config';

export type BackendConnectionStatus = 'online' | 'offline' | 'checking';

export interface BackendConnectionState {
  status: BackendConnectionStatus;
  lastError: string | null;
  lastChecked: number | null;
  backendUrl: string | null;
}

type Listener = (state: BackendConnectionState) => void;

const initialState: BackendConnectionState = {
  status: 'checking',
  lastError: null,
  lastChecked: null,
  backendUrl: null,
};

let state: BackendConnectionState = { ...initialState };
const listeners = new Set<Listener>();
let registeredWithServerApi = false;

function getBackendUrlSafe(): string | null {
  try {
    const url = getBackendUrl();
    return url && url.trim() ? url.trim().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function notify() {
  const s = { ...state };
  listeners.forEach((l) => l(s));
}

function registerConnectionFailureListener() {
  if (registeredWithServerApi || typeof window === 'undefined') return;
  registeredWithServerApi = true;
  try {
    serverApi.addConnectionFailureListener(() => {
      // Ne pas marquer « offline » quand c’est le serveur d’un ami qui échoue (pas « mon serveur »)
      const myUrl = getMyBackendUrl();
      const current = getBackendUrlSafe();
      if (myUrl != null && current !== null && current !== myUrl) return;
      state.status = 'offline';
      state.lastError = null;
      state.backendUrl = getBackendUrlSafe();
      state.lastChecked = Date.now();
      notify();
    });
  } catch {
    registeredWithServerApi = false;
  }
}

export function getBackendConnectionStore(): BackendConnectionState {
  registerConnectionFailureListener();
  return { ...state };
}

export function subscribeBackendConnectionStore(listener: Listener): () => void {
  registerConnectionFailureListener();
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function setBackendConnectionOffline(reason?: string): void {
  state.status = 'offline';
  state.lastError = reason ?? null;
  state.backendUrl = getBackendUrlSafe();
  state.lastChecked = Date.now();
  notify();
}

export function setBackendConnectionOnline(): void {
  state.status = 'online';
  state.lastError = null;
  state.backendUrl = getBackendUrlSafe();
  state.lastChecked = Date.now();
  notify();
}

export function setBackendConnectionChecking(): void {
  state.status = 'checking';
  state.lastError = null;
  state.lastChecked = Date.now();
  state.backendUrl = getBackendUrlSafe();
  notify();
}

/**
 * Lance un health check et met à jour le store selon le résultat.
 */
export async function checkBackendConnection(): Promise<boolean> {
  registerConnectionFailureListener();
  state.status = 'checking';
  state.lastError = null;
  state.backendUrl = getBackendUrlSafe();
  notify();

  try {
    const res = await serverApi.checkServerHealth();
    if (res.success && res.data?.reachable !== false) {
      setBackendConnectionOnline();
      return true;
    }
    state.status = 'offline';
    state.lastError = (res as { message?: string }).message ?? null;
    state.lastChecked = Date.now();
    notify();
    return false;
  } catch (err) {
    state.status = 'offline';
    state.lastError = err instanceof Error ? err.message : String(err);
    state.lastChecked = Date.now();
    state.backendUrl = getBackendUrlSafe();
    notify();
    return false;
  }
}
