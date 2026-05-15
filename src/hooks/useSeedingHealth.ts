import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';

export interface SeedingDiagnostic {
  status: 'ok' | 'warning' | 'error';
  total_seeding: number;
  warnings: string[];
  listen_port: number | null;
  upnp_enabled: boolean;
}

export function useSeedingHealth() {
  const [diagnostic, setDiagnostic] = useState<SeedingDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiagnostic = async () => {
    try {
      const res = await serverApi.getSeedingDiagnostic();
      if (res.success && res.data) {
        setDiagnostic(res.data);
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
