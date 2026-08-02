/**
 * Paramètres pour GET /api/torrents/external/download.
 * Centralise l'extraction depuis les IDs UI `external_<indexer>_<id|infoHash>`.
 *
 * C411 utilise des infohashes hex (40 chars), pas des IDs numériques type YGG.
 * L'ancienne regex `/^external_(.+?)_\d+$/` échouait donc pour C411.
 */

export interface ExternalTorrentLike {
  id?: string | null;
  infoHash?: string | null;
  info_hash?: string | null;
  _guid?: string | null;
  guid?: string | null;
  _externalLink?: string | null;
  external_link?: string | null;
  externalLink?: string | null;
  indexerId?: string | number | null;
  indexer_id?: string | number | null;
  indexerName?: string | null;
  indexer_name?: string | null;
  torrentId?: string | number | null;
  torrent_id?: string | number | null;
  _torrentId?: string | number | null;
  name?: string | null;
}

export interface ExternalDownloadParams {
  indexerTypeId: string | null;
  /** ID attendu par l'API indexer (hash C411, id numérique YGG, etc.). */
  torrentId: string | null;
  guid: string | null;
  infoHash: string | null;
  externalLink: string | null;
  indexerId: string | null;
  indexerName: string | null;
}

const INFO_HASH_RE = /^[a-f0-9]{40}$/i;

/**
 * Extrait `c411` depuis `external_c411_<infoHash>` ou `ygg-api` depuis `external_ygg-api_1420257`.
 * Accepte un suffixe hex (C411) ou numérique (YGG / Jackett).
 */
export function extractIndexerTypeIdFromExternalId(id: string | null | undefined): string | null {
  if (!id) return null;
  // Prefixe jusqu'au dernier underscore avant un infohash hex OU un id numérique
  const hexMatch = id.match(/^external_(.+)_[a-f0-9]{40}$/i);
  if (hexMatch) return hexMatch[1];
  const numMatch = id.match(/^external_(.+)_\d+$/);
  if (numMatch) return numMatch[1];
  // Fallback: premier segment après external_ (playHandler historique)
  return id.match(/^external_([^_]+)_/)?.[1] ?? null;
}

/**
 * Extrait l'identifiant torrent utile pour Torznab / template.
 * Pour C411 : infohash (pas `external_c411_<hash>` entier).
 */
export function extractTorrentIdFromExternalVariant(torrent: ExternalTorrentLike): string | null {
  const dedicated =
    torrent.torrentId ?? torrent.torrent_id ?? torrent._torrentId ?? null;
  if (dedicated != null && String(dedicated).trim() !== '') {
    return String(dedicated);
  }

  const infoHash = (torrent.infoHash ?? torrent.info_hash ?? '').trim();
  if (INFO_HASH_RE.test(infoHash)) {
    return infoHash.toLowerCase();
  }

  const id = torrent.id ?? '';
  const hexSuffix = id.match(/_([a-f0-9]{40})$/i)?.[1];
  if (hexSuffix) return hexSuffix.toLowerCase();

  const numSuffix = id.match(/_(\d+)$/)?.[1];
  if (numSuffix) return numSuffix;

  if (id.includes('_')) {
    return id.split('_').pop() ?? null;
  }
  return id || null;
}

export function buildExternalDownloadParams(torrent: ExternalTorrentLike): ExternalDownloadParams {
  const infoHashRaw = (torrent.infoHash ?? torrent.info_hash ?? '').trim();
  const infoHash = INFO_HASH_RE.test(infoHashRaw) ? infoHashRaw.toLowerCase() : null;
  const guid =
    (torrent._guid ?? torrent.guid ?? infoHash ?? extractTorrentIdFromExternalVariant(torrent)) ||
    null;
  const indexerIdRaw = torrent.indexerId ?? torrent.indexer_id ?? null;

  return {
    indexerTypeId: extractIndexerTypeIdFromExternalId(torrent.id),
    torrentId: extractTorrentIdFromExternalVariant(torrent),
    guid,
    infoHash,
    externalLink:
      torrent._externalLink ?? torrent.external_link ?? torrent.externalLink ?? null,
    indexerId: indexerIdRaw != null ? String(indexerIdRaw) : null,
    indexerName: torrent.indexerName ?? torrent.indexer_name ?? null,
  };
}

/** True si le magnet sans trackers privés est risqué (tracker privé type C411). */
export function shouldAvoidBareMagnetFallback(indexerTypeId: string | null | undefined): boolean {
  if (!indexerTypeId) return false;
  const id = indexerTypeId.toLowerCase();
  return id === 'c411' || id.includes('c411');
}

/** Détecte une réponse HTML (login / page détail) au lieu d'un .torrent bencode. */
export function isHtmlInsteadOfTorrent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const head = new TextDecoder().decode(bytes.slice(0, 256)).toLowerCase();
  return (
    head.includes('<!doctype') ||
    head.includes('<html') ||
    head.includes('<head') ||
    head.includes('se connecter')
  );
}

/** Un .torrent bencode valide commence par `d` (dict). */
export function looksLikeBencodedTorrent(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes[0] === 0x64 && !isHtmlInsteadOfTorrent(bytes);
}
