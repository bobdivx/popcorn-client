export interface BuildStreamUrlInput {
  /** URL du serveur local (utilisée comme base pour le proxy quand streamBackendUrl est défini). */
  baseUrl: string;
  infoHash: string;
  filePath: string;
  fileName: string;
  /** Index du fichier dans le torrent (pour la route stream-torrent). */
  fileIndex?: number | null;
  isDirectMode: boolean;
  isLucieMode?: boolean;
  /** Quand défini (bibliothèque partagée), le flux passe par le proxy local /api/remote-stream/proxy. */
  streamBackendUrl?: string | null;
  /** Hauteur max en pixels pour le transcode HLS (720, 480, 360). Non utilisé en mode direct/Lucie. */
  maxHeight?: number | null;
  /** Mode streaming torrent (option payante) : URL /api/stream-torrent avec token. */
  streamingTorrentMode?: boolean;
  /** Token cloud pour la route stream-torrent (passé en ?access_token= pour la balise video). */
  streamingTorrentToken?: string | null;
}

export interface BuildStreamUrlResult {
  streamUrl: string;
  normalizedPath: string;
  encodedPath: string;
  pathForUrl: string;
}

export function normalizeStreamPath(filePath: string): string {
  let normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.startsWith('/') && !normalizedPath.startsWith('//')) {
    normalizedPath = normalizedPath.substring(1);
  }
  return normalizedPath;
}

/** Construit l'URL du proxy local pour un flux distant (backend + path + query). */
export function buildProxyUrl(
  localBaseUrl: string,
  streamBackendUrl: string,
  remotePath: string,
  queryParams: Record<string, string>,
): string {
  const base = localBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('backend', streamBackendUrl.trim());
  params.set('path', remotePath);
  for (const [k, v] of Object.entries(queryParams)) {
    if (v != null && v !== '') params.set(k, v);
  }
  return `${base}/api/remote-stream/proxy?${params.toString()}`;
}

export function buildStreamUrl({
  baseUrl,
  infoHash,
  filePath,
  fileName,
  fileIndex,
  isDirectMode,
  isLucieMode = false,
  streamBackendUrl,
  maxHeight,
  streamingTorrentMode,
  streamingTorrentToken,
}: BuildStreamUrlInput): BuildStreamUrlResult {
  const normalizedPath = normalizeStreamPath(filePath);

  // Mode streaming torrent (option payante) : route dédiée avec token
  if (streamingTorrentMode && infoHash && streamingTorrentToken && typeof fileIndex === 'number') {
    const idx = fileIndex;
    const encName = encodeURIComponent(fileName || 'video');
    const tokenParam = `access_token=${encodeURIComponent(streamingTorrentToken)}`;
    const streamUrlSt = `${baseUrl.replace(/\/$/, '')}/api/stream-torrent/${infoHash}/${idx}/${encName}?${tokenParam}`;
    return {
      streamUrl: streamUrlSt,
      normalizedPath,
      encodedPath: encName,
      pathForUrl: fileName || normalizedPath,
    };
  }

  // Mode direct: la route backend directe n'accepte pas toujours les chemins absolus Windows //?/...
  const pathForUrl =
    isDirectMode && /^\/\/\?\//.test(normalizedPath)
      ? normalizedPath.split('/').pop() || fileName || normalizedPath
      : normalizedPath;

  const encodedPath = encodeURIComponent(pathForUrl);
  const useProxy = Boolean(streamBackendUrl?.trim());

  const infoHashParam = infoHash ? `?info_hash=${encodeURIComponent(infoHash)}` : '';
  const hlsQueryParams: Record<string, string> = { info_hash: infoHash };
  if (maxHeight != null && maxHeight > 0) {
    hlsQueryParams.max_height = String(maxHeight);
  }
  const hlsQueryString = new URLSearchParams(hlsQueryParams).toString();

  // Construire l'URL selon le mode (avec ou sans proxy pour bibliothèque partagée)
  let streamUrl: string;
  if (useProxy) {
    const backend = streamBackendUrl!.trim();
    if (isLucieMode) {
      streamUrl = buildProxyUrl(baseUrl, backend, '/api/lucie/manifest.json', {
        path: pathForUrl,
        info_hash: infoHash,
      });
    } else if (isDirectMode) {
      streamUrl = buildProxyUrl(baseUrl, backend, `/api/local/stream/${encodedPath}`, {
        info_hash: infoHash,
      });
    } else {
      const params: Record<string, string> = { info_hash: infoHash };
      if (maxHeight != null && maxHeight > 0) params.max_height = String(maxHeight);
      streamUrl = buildProxyUrl(baseUrl, backend, `/api/local/stream/${encodedPath}/playlist.m3u8`, params);
    }
  } else if (isLucieMode) {
    streamUrl = `${baseUrl}/api/lucie/manifest.json?path=${encodedPath}&info_hash=${encodeURIComponent(infoHash)}`;
  } else if (isDirectMode) {
    streamUrl = `${baseUrl}/api/local/stream/${encodedPath}${infoHashParam}`;
  } else {
    streamUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8?${hlsQueryString}`;
  }

  return {
    streamUrl,
    normalizedPath,
    encodedPath,
    pathForUrl,
  };
}
