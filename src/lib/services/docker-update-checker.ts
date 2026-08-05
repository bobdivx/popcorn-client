/**
 * Vérification des mises à jour Docker (fiable via gitSha + channel Hub).
 * Compare /VERSION.json local et health backend vs tags Docker Hub (channel).
 */
import { getBackendUrl } from '../backend-config.js';

export interface UpdateInfo {
  current: string;
  latest: string;
  currentSha?: string | null;
  latestSha?: string | null;
}

export interface DockerUpdateCheckResult {
  clientUpdate?: UpdateInfo;
  serverUpdate?: UpdateInfo;
  canUpdateInApp?: boolean;
  updateDisabledReason?: string | null;
}

interface VersionStamp {
  version?: string;
  build?: number;
  gitSha?: string;
  git_sha?: string;
  builtAt?: string;
  channel?: string;
}

interface DockerTagPayload {
  latest?: string | null;
  channel?: string | null;
  channel_digest?: string | null;
  channel_git_sha?: string | null;
  channel_last_updated?: string | null;
}

interface DockerUpdateStatusPayload {
  enabled: boolean;
  reason?: string | null;
  client_channel?: string;
  server_channel?: string;
}

function shaOf(v?: VersionStamp | null): string | null {
  const s = (v?.gitSha || v?.git_sha || '').trim().toLowerCase();
  return s || null;
}

function labelOf(v?: VersionStamp | null, sha?: string | null): string {
  const ver = v?.version || '?';
  const build = v?.build != null ? `+${v.build}` : '';
  const short = sha ? ` (${sha.slice(0, 7)})` : '';
  return `v${ver}${build}${short}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchHubChannel(
  backendBaseUrl: string,
  image: string,
  channel: string
): Promise<DockerTagPayload | null> {
  const url = `${backendBaseUrl.replace(/\/$/, '')}/api/client/docker-tags/${image}?channel=${encodeURIComponent(channel)}`;
  const json = await fetchJson<{ success?: boolean; data?: DockerTagPayload }>(url);
  if (!json?.success || !json.data) return null;
  return json.data;
}

/**
 * Vérifie client + serveur. channel client/serveur lus via /docker-update/status si dispo.
 */
export async function checkDockerUpdates(versions: {
  client?: VersionStamp;
  backend?: VersionStamp;
}): Promise<DockerUpdateCheckResult> {
  const result: DockerUpdateCheckResult = {};
  const backendBaseUrl = getBackendUrl();
  if (!backendBaseUrl?.trim()) return result;

  const statusJson = await fetchJson<{
    success?: boolean;
    data?: DockerUpdateStatusPayload;
  }>(`${backendBaseUrl.replace(/\/$/, '')}/api/client/docker-update/status`);
  const status = statusJson?.data;
  result.canUpdateInApp = Boolean(status?.enabled);
  result.updateDisabledReason = status?.reason || null;

  const clientChannel = status?.client_channel || versions.client?.channel || 'dev';
  const serverChannel = status?.server_channel || versions.backend?.channel || 'nvidia-dev';

  // Client: toujours lire /VERSION.json (source de vérité runtime)
  let clientLocal = versions.client || {};
  try {
    const local = await fetchJson<{ client?: VersionStamp }>('/VERSION.json');
    if (local?.client) clientLocal = { ...clientLocal, ...local.client };
  } catch {
    /* ignore */
  }

  const [fe, be] = await Promise.all([
    fetchHubChannel(backendBaseUrl, 'popcorn-frontend', clientChannel),
    fetchHubChannel(backendBaseUrl, 'popcorn-backend', serverChannel),
  ]);

  const localClientSha = shaOf(clientLocal);
  const remoteClientSha = fe?.channel_git_sha?.toLowerCase() || null;
  if (localClientSha && remoteClientSha && localClientSha !== remoteClientSha) {
    result.clientUpdate = {
      current: labelOf(clientLocal, localClientSha),
      latest: labelOf({ version: fe?.latest || undefined }, remoteClientSha),
      currentSha: localClientSha,
      latestSha: remoteClientSha,
    };
  }

  const localServerSha = shaOf(versions.backend);
  const remoteServerSha = be?.channel_git_sha?.toLowerCase() || null;
  if (localServerSha && remoteServerSha && localServerSha !== remoteServerSha) {
    result.serverUpdate = {
      current: labelOf(versions.backend, localServerSha),
      latest: labelOf({ version: be?.latest || undefined }, remoteServerSha),
      currentSha: localServerSha,
      latestSha: remoteServerSha,
    };
  }

  // Fallback semver si pas encore de gitSha local (images anciennes)
  if (!result.clientUpdate && !localClientSha && clientLocal.version && fe?.latest) {
    if (compareVersions(fe.latest, clientLocal.version) > 0) {
      result.clientUpdate = {
        current: `v${clientLocal.version}`,
        latest: `v${fe.latest}`,
      };
    }
  }
  if (!result.serverUpdate && !localServerSha && versions.backend?.version && be?.latest) {
    if (compareVersions(be.latest, versions.backend.version) > 0) {
      result.serverUpdate = {
        current: `v${versions.backend.version}`,
        latest: `v${be.latest}`,
      };
    }
  }

  return result;
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
