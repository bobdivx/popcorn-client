import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus } from '../../../lib/client/types';

export function useSetupStatus() {
  const [loading, setLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);

  const checkSetupStatus = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getSetupStatus();
      
      if (response.success && response.data) {
        setSetupStatus(response.data);
      } else {
        console.error('Erreur lors de la récupération du statut:', response.error);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du setup:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSetupStatus();
  }, []);

  return {
    loading,
    setupStatus,
    checkSetupStatus,
  };
}
