/**
 * Store unifié du statut de synchronisation torrent.
 * Une seule source de vérité : polling centralisé, consommée par Navbar, TorrentSyncManager,
 * SettingsOverview, useSyncStatus (Dashboard).
 * Quand le backend est connu offline (backend-connection-store), on ne lance pas de requête
 * et on réessaie moins souvent pour éviter le spam console (GET ... net::ERR_*).
 */

import { serverApi } from './client/server-api';
import { getBackendConnectionStore } from './backend-connection-store';

export interface SyncProgressStore {
  current_indexer?: string | null;
  current_category?: string | null;
  current_query?: string | null;
  indexer_torrents: Record<string, number>;
  category_torrents: Record<string, number>;
  total_processed: number;
  total_to_process: number;
  fetched_pages?: number;
  errors: string[];
  /** Dernières lignes du journal (horodatées). Pour affichage "Ce qui se passe". */
  log_lines?: string[];
  /** Origine du démarrage : "manual" | "scheduled". */
  sync_trigger?: string | null;
}

export interface SyncStatusStore {
  sync_in_progress: boolean;
  last_sync_date: number | null;
  settings?: Record<string, unknown>;
  stats: Record<string, number>;
  stats_by_indexer?: Record<string, Record<string, number>>;
  sync_start_time?: number | null;
  progress?: SyncProgressStore;
  tmdb_stats?: { with_tmdb: number; without_tmdb: number; missing_tmdb: Array<[string, string]> };
  /** Stats TMDB par indexer (pour la modale détail d’un indexer) */
  tmdb_stats_by_indexer?: Record<string, { with_tmdb: number; without_tmdb: number; missing_tmdb: Array<[string, string]> }>;
  media_by_genre_by_indexer?: Record<string, Record<string, string[]>>;
  genre_counts_films?: Record<string, number>;
  genre_counts_series?: Record<string, number>;
}

type Listener = (state: StoreState) => void;

interface StoreState {
  status: SyncStatusStore | null;
  loading: boolean;
}

const initialState: StoreState = { status: null, loading: true };

let state: StoreState = { ...initialState };
const listeners = new Set<Listener>();
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

const POLL_ACTIVE_MS = 1500;
const POLL_IDLE_MS = 30000;
/** Quand le statut n'est pas encore chargé (ou erreur), retry souvent pour afficher la sync dès que possible (ex. page /settings/sync ouverte depuis une autre machine). */
const POLL_WHEN_NULL_MS = 2000;
/** Quand le backend est connu offline : ne pas bombarder l'API, réessayer moins souvent (évite le spam console). */
const POLL_WHEN_OFFLINE_MS = 30000;

function notify() {
  const s = { ...state };
  listeners.forEach((l) => l(s));
}

export function getSyncStatusStore(): StoreState {
  return { ...state };
}

export function subscribeSyncStatusStore(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };
}

export async function refreshSyncStatusStore(): Promise<void> {
  const backendStatus = getBackendConnectionStore().status;
  if (backendStatus === 'offline') {
    // Ne pas appeler l'API quand le backend est connu offline : évite le spam console (GET ... net::ERR_*).
    state.loading = false;
    notify();
    if (listeners.size > 0) schedulePolling();
    return;
  }

  // Ne passer en loading que s'il n'y a pas encore de statut (premier chargement).
  // En polling (déjà un status), ne pas toucher à loading pour éviter que la barre de sync s'affiche/disparaisse en continu.
  const isPollingRefresh = state.status !== null;
  if (!isPollingRefresh) {
    state.loading = true;
    notify();
  }
  try {
    const response = await serverApi.getSyncStatus();
    if (response.success && response.data) {
      const raw = response.data as Record<string, unknown>;
      // Normaliser pour que sync_in_progress soit toujours un bool (API peut renvoyer 0/1)
      state.status = {
        ...raw,
        sync_in_progress: Boolean(raw.sync_in_progress),
      } as SyncStatusStore;
      state.loading = false;
    } else {
      state.status = null;
      state.loading = false;
    }
  } catch {
    state.status = null;
    state.loading = false;
  }
  notify();
  if (listeners.size > 0) schedulePolling();
}

function schedulePolling() {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  const backendStatus = getBackendConnectionStore().status;
  if (backendStatus === 'offline') {
    pollIntervalId = setInterval(() => refreshSyncStatusStore(), POLL_WHEN_OFFLINE_MS);
    return;
  }
  const inProgress = Boolean(state.status?.sync_in_progress);
  const noStatusYet = state.status === null;
  const ms = noStatusYet ? POLL_WHEN_NULL_MS : inProgress ? POLL_ACTIVE_MS : POLL_IDLE_MS;
  pollIntervalId = setInterval(() => {
    refreshSyncStatusStore();
  }, ms);
}

/**
 * Démarre le polling (premier refresh + intervalle). À appeler quand un composant toujours monté s'abonne (ex. Navbar).
 */
export function startSyncStatusPolling(): () => void {
  if (listeners.size === 0) return () => {};
  refreshSyncStatusStore();
  return () => {
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  };
}
