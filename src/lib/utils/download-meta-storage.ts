/**
 * Stockage session des métadonnées d’un téléchargement (poster, backdrop, titre nettoyé)
 * quand l’ajout vient de la page MediaDetail, pour afficher immédiatement les cartes
 * sur la page Téléchargements sans attendre l’API backend.
 */

const STORAGE_KEY = 'popcorn_download_meta';

export interface DownloadMeta {
  posterUrl: string | null;
  backdropUrl: string | null;
  cleanTitle: string | null;
}

export type DownloadMetaMap = Record<string, DownloadMeta>;

function getStored(): DownloadMetaMap {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DownloadMetaMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function setStored(map: DownloadMetaMap): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}

/** Récupère toutes les métadonnées stockées (info_hash -> { posterUrl, backdropUrl, cleanTitle }) */
export function getDownloadMeta(): DownloadMetaMap {
  return getStored();
}

/**
 * Enregistre les métadonnées pour un info_hash (appelé après ajout depuis MediaDetail).
 * Les valeurs null/undefined sont ignorées (on n’écrase pas une valeur existante par null).
 */
export function saveDownloadMeta(
  infoHash: string,
  meta: { posterUrl?: string | null; backdropUrl?: string | null; cleanTitle?: string | null }
): void {
  if (!infoHash || typeof infoHash !== 'string') return;
  const key = infoHash.toLowerCase().trim();
  const current = getStored();
  const existing = current[key] ?? { posterUrl: null, backdropUrl: null, cleanTitle: null };
  current[key] = {
    posterUrl: meta.posterUrl != null && meta.posterUrl !== '' ? meta.posterUrl : existing.posterUrl,
    backdropUrl: meta.backdropUrl != null && meta.backdropUrl !== '' ? meta.backdropUrl : existing.backdropUrl,
    cleanTitle: meta.cleanTitle != null && meta.cleanTitle !== '' ? meta.cleanTitle : existing.cleanTitle,
  };
  setStored(current);
}

const CLIENT_STATS_KEY = 'popcorn_download_client_stats';

/** Stats client (librqbit) pour un info_hash, utilisées par MediaDetail à l’ouverture depuis la page Téléchargements. */
export interface DownloadClientStats {
  info_hash: string;
  name: string;
  state: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  download_speed?: number;
  upload_speed?: number;
  download_started?: boolean;
  [key: string]: unknown;
}

function getClientStatsStored(): Record<string, DownloadClientStats> {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLIENT_STATS_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DownloadClientStats>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function setClientStatsStored(map: Record<string, DownloadClientStats>): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CLIENT_STATS_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}

/** Récupère les stats client stockées pour un info_hash (pour MediaDetail ouvert depuis Téléchargements). */
export function getDownloadClientStats(infoHash: string): DownloadClientStats | null {
  if (!infoHash || typeof infoHash !== 'string') return null;
  const key = infoHash.toLowerCase().trim();
  return getClientStatsStored()[key] ?? null;
}

/** Enregistre les stats client pour un info_hash (appelé au clic sur « Ouvrir » dans la modale détail téléchargement). */
export function saveDownloadClientStats(infoHash: string, stats: DownloadClientStats): void {
  if (!infoHash || typeof infoHash !== 'string') return;
  const key = infoHash.toLowerCase().trim();
  const current = getClientStatsStored();
  current[key] = { ...stats, info_hash: infoHash };
  setClientStatsStored(current);
}
