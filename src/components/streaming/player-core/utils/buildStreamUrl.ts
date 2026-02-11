export interface BuildStreamUrlInput {
  baseUrl: string;
  infoHash: string;
  filePath: string;
  fileName: string;
  isDirectMode: boolean;
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

export function buildStreamUrl({
  baseUrl,
  infoHash,
  filePath,
  fileName,
  isDirectMode,
}: BuildStreamUrlInput): BuildStreamUrlResult {
  const normalizedPath = normalizeStreamPath(filePath);

  // Mode direct: la route backend directe n'accepte pas toujours les chemins absolus Windows //?/...
  const pathForUrl =
    isDirectMode && /^\/\/\?\//.test(normalizedPath)
      ? normalizedPath.split('/').pop() || fileName || normalizedPath
      : normalizedPath;

  const encodedPath = encodeURIComponent(pathForUrl);
  const infoHashParam = infoHash ? `?info_hash=${encodeURIComponent(infoHash)}` : '';
  const streamUrl = isDirectMode
    ? `${baseUrl}/api/local/stream/${encodedPath}${infoHashParam}`
    : `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8${infoHashParam}`;

  return {
    streamUrl,
    normalizedPath,
    encodedPath,
    pathForUrl,
  };
}
