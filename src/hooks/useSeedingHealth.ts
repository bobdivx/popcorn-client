import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';
import { isFeatureEnabled, loadCapabilities, type ServerCapabilities } from '../lib/capabilities';
import { getBackendUrl } from '../lib/backend-config';

export interface SeedingDiagnostic {
  status: 'ok' | 'warning' | 'error';
  total_seeding: number;
  warnings: string[];
  listen_port: number | null;
  upnp_enabled: boolean;
}

/** Serveurs (URL backend) qui ont répondu 404 : la route n'existe pas, on ne la rappelle plus. */
const unsupportedBackends = new Set<string>();

/**
 * Le diagnostic de seeding n'existe que sur les serveurs historiques avec moteur torrent intégré :
 * absent sans torrent, et retiré des serveurs à modules « process » (refonte core + modules).
 */
export function shouldFetchSeedingDiagnostic(caps: ServerCapabilities | null): boolean {
  if (!isFeatureEnabled(caps, 'torrent')) return false;
  if (caps?.modules?.processHost === true) return false;
  return !unsupportedBackends.has(getBackendUrl() || '');
}

/** Mémorise un 404 (tests et appels suivants). */
export function markSeedingDiagnosticUnsupported(backendUrl: string): void {
  unsupportedBackends.add(backendUrl);
}

export function useSeedingHealth() {
  const [diagnostic, setDiagnostic] = useState<SeedingDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiagnostic = async () => {
    // Route absente (serveur cœur, serveur à modules, ou 404 déjà reçu) : aucun appel.
    if (!shouldFetchSeedingDiagnostic(await loadCapabilities().catch(() => null))) {
      setDiagnostic(null);
      setLoading(false);
      return;
    }
    try {
      const res = await serverApi.getSeedingDiagnostic();
      if (res.success && res.data) {
        setDiagnostic(res.data);
      } else if (res.error === 'NotFound') {
        markSeedingDiagnosticUnsupported(getBackendUrl() || '');
        setDiagnostic(null);
      }
    } catch (e) {
      console.error('Failed to fetch seeding diagnostic', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostic();
    const interval = setInterval(fetchDiagnostic, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return { diagnostic, loading, refetch: fetchDiagnostic };
}
