import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { SetupStatus } from '../../../lib/client/types';
import { hasBackendUrl } from '../../../lib/backend-config.js';

export function useSetupStatus() {
  // Au premier lancement, tant qu'aucune URL backend n'est configurée,
  // on ne tente pas de charger le statut (sinon l'assistant ne s'affiche pas).
  const [loading, setLoading] = useState(false);
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
    if (!hasBackendUrl()) {
      setLoading(false);
      setSetupStatus(null);
      return;
    }

    checkSetupStatus();
  }, []);

  return {
    loading,
    setupStatus,
    checkSetupStatus,
  };
}
