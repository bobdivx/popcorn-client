/**
 * Profil de lecture selon le réseau réel de l’appareil
 * (Network Information API + fallback heuristique).
 *
 * 4G / 3G : démarrer bas, buffer court, plafonner la hauteur HLS.
 * Wi‑Fi / Ethernet local : buffer plus large, qualité auto.
 */

export type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';

export interface NetworkPlaybackProfile {
  /** Type réseau approximatif. */
  effectiveType: NetworkEffectiveType;
  /** downlink API (Mbit/s) si connu. */
  downlinkMbps: number | null;
  saveData: boolean;
  /** Plafond HLS max_height (null = laisser le serveur). */
  suggestedMaxHeight: number | null;
  /** Secondes de buffer hls.js. */
  maxBufferLength: number;
  /** 0 = plus bas niveau, -1 = ABR auto. */
  startLevel: number;
  abrBandWidthFactor: number;
  label: string;
}

interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  type?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function readConnection(): NavigatorConnection | null {
  if (typeof navigator === 'undefined') return null;
  const n = navigator as Navigator & {
    connection?: NavigatorConnection;
    mozConnection?: NavigatorConnection;
    webkitConnection?: NavigatorConnection;
  };
  return n.connection || n.mozConnection || n.webkitConnection || null;
}

function classify(conn: NavigatorConnection | null): NetworkEffectiveType {
  if (!conn) return 'unknown';
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'wifi';
  const t = (conn.effectiveType || '').toLowerCase();
  if (t === 'slow-2g' || t === '2g' || t === '3g' || t === '4g') return t;
  if ((conn.downlink ?? 0) >= 10) return 'wifi';
  if ((conn.downlink ?? 0) >= 1.5) return '4g';
  if ((conn.downlink ?? 0) > 0) return '3g';
  return 'unknown';
}

export function getNetworkPlaybackProfile(isRemoteStream = false): NetworkPlaybackProfile {
  const conn = readConnection();
  const saveData = Boolean(conn?.saveData);
  const effectiveType = classify(conn);
  const downlinkMbps = typeof conn?.downlink === 'number' && conn.downlink > 0 ? conn.downlink : null;

  let suggestedMaxHeight: number | null = null;
  let maxBufferLength = isRemoteStream ? 120 : 90;
  let startLevel = -1;
  let abrBandWidthFactor = 0.8;
  let label = 'Réseau inconnu — qualité auto';

  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    suggestedMaxHeight = 360;
    maxBufferLength = 20;
    startLevel = 0;
    abrBandWidthFactor = 0.6;
    label = 'Réseau très lent / économie de données — 360p';
  } else if (effectiveType === '3g') {
    suggestedMaxHeight = 480;
    maxBufferLength = 24;
    startLevel = 0;
    abrBandWidthFactor = 0.65;
    label = '3G — 480p, buffer court';
  } else if (effectiveType === '4g') {
    suggestedMaxHeight = 720;
    maxBufferLength = 32;
    startLevel = 0;
    abrBandWidthFactor = 0.7;
    label = '4G — 720p pour démarrer plus vite';
  } else if (effectiveType === 'wifi') {
    suggestedMaxHeight = null;
    maxBufferLength = isRemoteStream ? 120 : 90;
    startLevel = -1;
    abrBandWidthFactor = 0.85;
    label = 'Wi‑Fi / Ethernet — qualité auto';
  }

  if (isRemoteStream && suggestedMaxHeight != null) {
    suggestedMaxHeight = Math.min(suggestedMaxHeight, 720);
    maxBufferLength = Math.max(maxBufferLength, 40);
  }

  return {
    effectiveType,
    downlinkMbps,
    saveData,
    suggestedMaxHeight,
    maxBufferLength,
    startLevel,
    abrBandWidthFactor,
    label,
  };
}

export function subscribeNetworkPlaybackProfile(onChange: () => void): () => void {
  const conn = readConnection();
  if (!conn?.addEventListener) return () => {};
  conn.addEventListener('change', onChange);
  return () => conn.removeEventListener?.('change', onChange);
}

export function formatEtaSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '…';
  if (seconds <= 0) return 'prêt';
  if (seconds < 10) return `${Math.ceil(seconds)} s`;
  if (seconds < 60) return `~${Math.round(seconds)} s`;
  return `~${Math.round(seconds / 60)} min`;
}
