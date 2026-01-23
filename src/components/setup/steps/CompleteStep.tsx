import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { SyncProgress } from '../components/SyncProgress';

interface CompleteStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onComplete: () => void;
}

export function CompleteStep({ focusedButtonIndex, buttonRefs, onComplete }: CompleteStepProps) {
  const [syncStatus, setSyncStatus] = useState<{ sync_in_progress: boolean; stats?: Record<string, number> } | null>(null);
  const [checkingSync, setCheckingSync] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);

  // Démarrer automatiquement la synchronisation au chargement de l'étape
  useEffect(() => {
    const startSync = async () => {
      if (syncStarted) return; // Ne démarrer qu'une seule fois
      
      try {
        console.log('[COMPLETE STEP] 🚀 Démarrage automatique de la synchronisation...');
        const syncResponse = await serverApi.startSync();
        if (syncResponse.success) {
          console.log('[COMPLETE STEP] ✅ Synchronisation démarrée avec succès');
          setSyncStarted(true);
        } else {
          console.warn('[COMPLETE STEP] ⚠️ Impossible de démarrer la synchronisation:', syncResponse.message);
          setSyncStarted(false);
        }
      } catch (error) {
        console.error('[COMPLETE STEP] ❌ Erreur lors du démarrage de la synchronisation:', error);
        setSyncStarted(false);
      }
    };

    startSync();
  }, [syncStarted]);

  // Vérifier le statut de la synchronisation au chargement et régulièrement
  useEffect(() => {
    const checkSync = async () => {
      try {
        const response = await serverApi.getSyncStatus();
        if (response.success && response.data) {
          const syncInProgress = response.data.sync_in_progress || false;
          const hasStats = response.data.stats && Object.keys(response.data.stats).length > 0;
          const progress = response.data.progress;
          
          // Vérifier si la sync est vraiment en cours
          const hasActiveProgress = progress && (
            progress.current_indexer || 
            progress.current_category || 
            (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
          );
          
          const isActuallySyncing = syncInProgress || hasActiveProgress || (hasStats && !syncComplete);
          
          setSyncStatus({
            sync_in_progress: isActuallySyncing,
            stats: response.data.stats,
          });
          
          if (!isActuallySyncing && !syncComplete) {
            // Vérifier plusieurs fois pour être sûr que la sync est vraiment terminée
            setTimeout(() => {
              setSyncComplete(true);
            }, 3000);
          }
        }
      } catch (err) {
        console.warn('[COMPLETE STEP] Erreur lors de la vérification du statut de synchronisation:', err);
      } finally {
        setCheckingSync(false);
      }
    };

    checkSync();
    
    // Vérifier toutes les 2 secondes si une sync est en cours
    const interval = setInterval(() => {
      if (!syncComplete || syncStarted) {
        checkSync();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncComplete, syncStarted]);

  const isSyncing = syncStatus?.sync_in_progress || false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-24 h-24 rounded-full bg-green-600 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h3 className="text-3xl font-bold text-white mb-2">Configuration terminée !</h3>
        
        <p className="text-lg text-gray-400 mb-6">
          Votre client Popcorn est maintenant configuré et prêt à l'emploi.
        </p>

        {/* Afficher la progression de la synchronisation si elle est en cours */}
        {checkingSync ? (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-6">
            <p className="text-blue-300 text-sm text-center">
              ⏳ Vérification de l'état de la synchronisation...
            </p>
          </div>
        ) : isSyncing ? (
          <div className="mb-6">
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-4">
              <p className="text-blue-300 text-sm text-center mb-4">
                🔄 Synchronisation des torrents en cours...
              </p>
            </div>
            <SyncProgress />
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mt-4">
              <p className="text-gray-400 text-sm text-center">
                Vous pouvez attendre la fin de la synchronisation ou accéder directement au dashboard.
              </p>
            </div>
          </div>
        ) : syncComplete ? (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 mb-6">
            <p className="text-green-300 text-sm text-center">
              ✅ Synchronisation terminée
            </p>
          </div>
        ) : null}

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <p className="text-white mb-4">
            Vous pouvez maintenant commencer à utiliser Popcorn pour rechercher et regarder vos contenus préférés.
          </p>
          
          <div className="flex justify-center">
            <video
              className="max-w-full h-auto rounded-lg"
              autoPlay
              muted
              playsInline
              onEnded={() => {
                // Ne pas rediriger automatiquement si la sync est en cours
                if (!isSyncing) {
                  onComplete();
                }
              }}
            >
              <source src="/intro.mp4" type="video/mp4" />
              Votre navigateur ne supporte pas la lecture de vidéos.
            </video>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isSyncing ? (
            <>
              <button
                ref={(el) => { buttonRefs.current[0] = el; }}
                className="w-full sm:w-auto px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                onClick={onComplete}
              >
                Accéder au dashboard maintenant
              </button>
              <button
                ref={(el) => { buttonRefs.current[1] = el; }}
                className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg opacity-50 cursor-not-allowed"
                disabled={true}
              >
                Synchronisation en cours...
              </button>
            </>
          ) : (
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
              onClick={onComplete}
            >
              Accéder au dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
