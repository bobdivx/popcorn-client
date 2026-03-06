import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { SyncProgress } from '../components/SyncProgress';
import { useI18n } from '../../../lib/i18n';
import { getLocalUsers, getLocalUserForSync } from '../../../lib/api/popcorn-web';
import { TokenManager } from '../../../lib/client/storage';

interface CompleteStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onComplete: () => void;
}

export function CompleteStep({ focusedButtonIndex, buttonRefs, onComplete }: CompleteStepProps) {
  const { t } = useI18n();
  const [syncStatus, setSyncStatus] = useState<{ sync_in_progress: boolean; stats?: Record<string, number> } | null>(null);
  const [checkingSync, setCheckingSync] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);
  const [syncStarted, setSyncStarted] = useState(false);

  // Synchroniser les utilisateurs locaux depuis popcorn-web vers le backend Rust
  useEffect(() => {
    const syncLocalUsers = async () => {
      try {
        const cloudToken = TokenManager.getCloudAccessToken();
        if (!cloudToken) {
          console.log('[COMPLETE STEP] Aucun token cloud, pas de synchronisation des utilisateurs locaux');
          return;
        }

        console.log('[COMPLETE STEP] 🔄 Synchronisation des utilisateurs locaux depuis popcorn-web...');
        const localUsers = await getLocalUsers();
        
        if (!localUsers || localUsers.length === 0) {
          console.log('[COMPLETE STEP] Aucun utilisateur local à synchroniser');
          return;
        }

        const cloudUserId = TokenManager.getUser()?.id;
        if (!cloudUserId) {
          console.warn('[COMPLETE STEP] ⚠️ Impossible de récupérer l\'ID du compte cloud');
          return;
        }

        // Synchroniser chaque utilisateur local actif vers le backend Rust
        for (const localUser of localUsers) {
          if (!localUser.isActive) {
            console.log(`[COMPLETE STEP] Utilisateur local ${localUser.email} non actif, ignoré`);
            continue;
          }

          try {
            // Vérifier si l'utilisateur existe déjà dans le backend
            const existingUser = await serverApi.getLocalUser(localUser.id);
            
            if (existingUser.success && existingUser.data) {
              console.log(`[COMPLETE STEP] Utilisateur local ${localUser.email} existe déjà dans le backend`);
              continue;
            }

            // Récupérer le password_hash depuis popcorn-web pour la synchronisation
            const syncResponse = await getLocalUserForSync(localUser.id);

            if (!syncResponse.success || !syncResponse.data) {
              console.warn(`[COMPLETE STEP] ⚠️ Impossible de récupérer les informations de ${localUser.email} pour la synchronisation:`, syncResponse.message);
              continue;
            }

            const userData = syncResponse.data;
            
            // Créer l'utilisateur dans le backend Rust
            const createResponse = await serverApi.createLocalUser({
              cloud_account_id: cloudUserId,
              email: userData.email,
              password_hash: userData.password_hash,
              display_name: userData.display_name || undefined,
            });

            if (createResponse.success) {
              console.log(`[COMPLETE STEP] ✅ Utilisateur local ${localUser.email} synchronisé avec succès`);
            } else {
              console.warn(`[COMPLETE STEP] ⚠️ Erreur lors de la synchronisation de ${localUser.email}:`, createResponse.message);
            }
          } catch (userError) {
            console.error(`[COMPLETE STEP] ❌ Erreur lors de la synchronisation de ${localUser.email}:`, userError);
          }
        }

        console.log('[COMPLETE STEP] ✅ Synchronisation des utilisateurs locaux terminée');
      } catch (error) {
        console.warn('[COMPLETE STEP] ⚠️ Erreur lors de la synchronisation des utilisateurs locaux:', error);
        // Ne pas bloquer le wizard si la synchronisation échoue
      }
    };

    syncLocalUsers();
  }, []);

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

        <h3 className="text-3xl font-bold text-white mb-2">{t('completeStep.configurationComplete')}</h3>
        
        <p className="text-lg text-gray-400 mb-6">
          {t('completeStep.clientReady')}
        </p>

        {/* Afficher la progression de la synchronisation si elle est en cours */}
        {checkingSync ? (
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-6">
            <p className="text-blue-300 text-sm text-center">
              {t('completeStep.checkingStatus')}
            </p>
          </div>
        ) : isSyncing ? (
          <div className="mb-6">
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-4">
              <p className="text-blue-300 text-sm text-center mb-4">
                {t('completeStep.syncInProgress')}
              </p>
            </div>
            <SyncProgress />
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mt-4">
              <p className="text-gray-400 text-sm text-center">
                {t('completeStep.waitOrAccess')}
              </p>
            </div>
          </div>
        ) : syncComplete ? (
          <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 mb-6">
            <p className="text-green-300 text-sm text-center">
              {t('completeStep.syncComplete')}
            </p>
          </div>
        ) : null}

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <p className="text-white mb-4">
            {t('completeStep.canStartUsing')}
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
                {t('completeStep.accessDashboardNow')}
              </button>
              <button
                ref={(el) => { buttonRefs.current[1] = el; }}
                className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg opacity-50 cursor-not-allowed"
                disabled={true}
              >
                {t('sync.syncInProgress')}
              </button>
            </>
          ) : (
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              className="w-full sm:w-auto px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-lg"
              onClick={onComplete}
            >
              {t('wizard.complete.startUsing')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
