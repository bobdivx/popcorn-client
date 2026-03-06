/**
 * Vérification des mises à jour pour les déploiements Docker.
 * Compare les versions client/serveur actuelles avec les derniers tags des images
 * sur Docker Hub (pas GitHub, adapté aux dépôts privés).
 * La mise à jour réelle des conteneurs reste à faire sur l'hôte.
 *
 * Utilise l'API backend comme proxy vers Docker Hub pour éviter les erreurs CORS
 * (hub.docker.com n'autorise pas les requêtes cross-origin depuis le navigateur).
 */

/** Noms des images Docker Hub (client = frontend, server = backend) */
const IMAGE_CLIENT = 'popcorn-frontend';
const IMAGE_SERVER = 'popcorn-backend';

export interface UpdateInfo {
  current: string;
  latest: string;
}

export interface DockerUpdateCheckResult {
  clientUpdate?: UpdateInfo;
  serverUpdate?: UpdateInfo;
}

function compareVersions(a: string, b: string): number {
  const norm = (v: string) => v.replace(/^v/, '').trim();
  const parts = (v: string) => norm(v).split('.').map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * Récupère la dernière version (tag semver) pour une image Docker Hub
 * via l'API backend (proxy pour éviter CORS).
 */
async function fetchLatestTagViaBackend(
  backendBaseUrl: string,
  imageName: string
): Promise<string | null> {
  try {
    const url = `${backendBaseUrl.replace(/\/$/, '')}/api/client/docker-tags/${imageName}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success || !json?.data?.latest) return null;
    return json.data.latest as string;
  } catch {
    return null;
  }
}

/**
 * Vérifie si des mises à jour sont disponibles pour le client et/ou le serveur
 * via les tags Docker Hub (images popcorn-frontend et popcorn-backend).
 * Utilise l'API backend comme proxy (évite CORS).
 */
export async function checkDockerUpdates(versions: {
  client?: { version?: string };
  backend?: { version?: string };
}): Promise<DockerUpdateCheckResult> {
  const result: DockerUpdateCheckResult = {};

  const { getBackendUrl } = await import('../backend-config.js');
  const backendBaseUrl = getBackendUrl();
  if (!backendBaseUrl?.trim()) {
    return result;
  }

  const [latestClient, latestServer] = await Promise.all([
    fetchLatestTagViaBackend(backendBaseUrl, IMAGE_CLIENT),
    fetchLatestTagViaBackend(backendBaseUrl, IMAGE_SERVER),
  ]);

  const clientVersion = versions.client?.version;
  if (clientVersion && latestClient && compareVersions(latestClient, clientVersion) > 0) {
    result.clientUpdate = { current: clientVersion, latest: latestClient };
  }

  const serverVersion = versions.backend?.version;
  if (serverVersion && latestServer && compareVersions(latestServer, serverVersion) > 0) {
    result.serverUpdate = { current: serverVersion, latest: latestServer };
  }

  return result;
}
