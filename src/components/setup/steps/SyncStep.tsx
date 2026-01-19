import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { SyncProgress } from '../components/SyncProgress';

interface SyncStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onPrevious: () => void;
  onNext: () => void;
}

export function SyncStep({ focusedButtonIndex, buttonRefs, onPrevious, onNext }: SyncStepProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);
  const [error, setError] = useState('');
  const [consecutiveChecks, setConsecutiveChecks] = useState(0); // Compteur de vérifications consécutives

  // Vérifier si une synchronisation est en cours
  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        const response = await serverApi.getSyncStatus();
        if (response.success && response.data) {
          const syncInProgress = response.data.sync_in_progress || false;
          const hasStats = response.data.stats && Object.keys(response.data.stats).length > 0;
          const progress = response.data.progress;
          
          // Vérifier si la sync est vraiment en cours en regardant plusieurs indicateurs
          const hasActiveProgress = progress && (
            progress.current_indexer || 
            progress.current_category || 
            (progress.total_to_process > 0 && progress.total_processed < progress.total_to_process)
          );
          
          // Si la sync est marquée comme en cours OU si on a des stats OU si on a une progression active
          const isActuallySyncing = syncInProgress || hasActiveProgress || (hasStats && syncStarted && !syncComplete);
          
          setSyncing(isActuallySyncing);
          
          // Si la sync est vraiment en cours, réinitialiser le compteur
          if (isActuallySyncing) {
            setConsecutiveChecks(0);
            return;
          }
          
          // Si la sync n'est pas en cours, incrémenter le compteur
          if (!syncInProgress && !hasActiveProgress && syncStarted && !syncComplete) {
            const newCount = consecutiveChecks + 1;
            setConsecutiveChecks(newCount);
            
            // Marquer comme complète seulement après 3 vérifications consécutives (6 secondes)
            // Cela évite de marquer comme complète si le backend est juste lent à répondre
            if (newCount >= 3) {
              console.log('[SYNC STEP] ✅ Synchronisation terminée après 3 vérifications consécutives');
              setSyncComplete(true);
              setSyncing(false);
              setConsecutiveChecks(0);
            } else {
              console.log(`[SYNC STEP] Vérification ${newCount}/3 : sync semble terminée, vérification dans 2s...`);
            }
          }
        } else {
          // Si la réponse n'est pas un succès, continuer à vérifier et garder syncing à true si syncStarted
          if (syncStarted && !syncComplete) {
            setSyncing(true); // Garder l'affichage de la sync même si le backend ne répond pas
            setConsecutiveChecks(0); // Réinitialiser le compteur car on ne peut pas vérifier
          }
          console.log('[SYNC STEP] Réponse non réussie, continuation de la vérification');
        }
      } catch (err) {
        // En cas d'erreur (timeout, etc.), continuer à vérifier et garder syncing à true si syncStarted
        if (syncStarted && !syncComplete) {
          setSyncing(true); // Garder l'affichage de la sync même en cas d'erreur
          setConsecutiveChecks(0); // Réinitialiser le compteur car on ne peut pas vérifier
        }
        if (err instanceof Error && (err.message.includes('Timeout') || err.message.includes('504'))) {
          console.log('[SYNC STEP] ⚠️ Backend lent, continuation de la vérification');
        } else {
          console.warn('[SYNC STEP] Erreur lors de la vérification du statut:', err);
        }
      }
    };

    // Si une sync a été démarrée, vérifier immédiatement
    if (syncStarted) {
      checkSyncStatus();
    }
    
    // Vérifier toutes les 2 secondes si une sync est en cours
    const interval = setInterval(() => {
      if (syncStarted && !syncComplete) {
        checkSyncStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncStarted, syncComplete, consecutiveChecks]);

  const handleStartSync = async () => {
    try {
      setError('');
      setSyncStarted(true);
      setSyncing(true);
      setSyncComplete(false);
      setConsecutiveChecks(0); // Réinitialiser le compteur
      
      // Démarrer la synchronisation
      const response = await serverApi.startSync();
      
      if (!response.success) {
        setError(response.message || 'Erreur lors du démarrage de la synchronisation');
        setSyncing(false);
        setSyncStarted(false);
        return;
      }
      
      // La synchronisation a démarré, on attend qu'elle se termine
      // Le useEffect se chargera de détecter la fin
    } catch (err) {
      console.error('[SYNC STEP] Erreur lors du démarrage de la synchronisation:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du démarrage de la synchronisation');
      setSyncing(false);
      setSyncStarted(false);
    }
  };

  const handleNext = () => {
    if (syncComplete) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      {!syncStarted ? (
        <>
          <div className="text-center">
            <h3 className="text-3xl font-bold text-white mb-2">Synchronisation des torrents</h3>
            <p className="text-lg text-gray-400 mb-6">
              Lancez la première synchronisation pour récupérer les torrents depuis vos indexers configurés.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
            <p className="text-white mb-4">
              La synchronisation va interroger vos indexers activés pour récupérer les torrents disponibles.
              Cette opération peut prendre plusieurs minutes selon le nombre d'indexers et de torrents.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Les torrents seront organisés par catégorie (films, séries)</li>
              <li>Les métadonnées TMDB seront ajoutées automatiquement si configurées</li>
              <li>Vous pourrez relancer une synchronisation depuis les paramètres plus tard</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              className="w-full sm:w-auto px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
              onClick={onPrevious}
            >
              Précédent
            </button>
            <button
              ref={(el) => { buttonRefs.current[1] = el; }}
              className="w-full sm:flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
              onClick={handleStartSync}
              disabled={syncing}
            >
              {syncing ? 'Démarrage...' : 'Lancer la synchronisation'}
            </button>
          </div>
        </>
      ) : syncing ? (
        <>
          <div className="text-center">
            <h3 className="text-3xl font-bold text-white mb-2">Synchronisation en cours</h3>
            <p className="text-lg text-gray-400">
              Synchronisation des torrents depuis les indexers...
            </p>
          </div>

          {/* Visuel de synchronisation */}
          <SyncProgress />

          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
            <p className="text-blue-300 text-sm text-center">
              ⏳ Veuillez patienter pendant la synchronisation. Vous pourrez continuer une fois terminée.
            </p>
          </div>
        </>
      ) : syncComplete ? (
        <>
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

            <h3 className="text-3xl font-bold text-white mb-2">Synchronisation terminée !</h3>
            
            <p className="text-lg text-gray-400 mb-6">
              Les torrents ont été synchronisés avec succès depuis vos indexers.
            </p>

            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
              <p className="text-white">
                Vous pouvez maintenant continuer vers l'étape finale pour accéder au dashboard.
              </p>
            </div>

            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
              onClick={handleNext}
            >
              Continuer
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
