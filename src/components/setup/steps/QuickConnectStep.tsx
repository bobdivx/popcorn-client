import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig } from '../../../lib/api/popcorn-web';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { generateQRCode, type QuickConnectData } from '../../../lib/utils/qrcode';
import { getBackendUrl } from '../../../lib/backend-config';

interface QuickConnectStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
}

export function QuickConnectStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange }: QuickConnectStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialiser la connexion rapide au montage
    initQuickConnect();

    // Nettoyer l'intervalle au démontage
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const initQuickConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.initQuickConnect();

      if (!response.success) {
        setError(response.message || 'Erreur lors de l\'initialisation de la connexion rapide');
        setLoading(false);
        return;
      }

      if (response.data) {
        setCode(response.data.code);
        setSecret(response.data.secret);
        setExpiresAt(response.data.expiresAt);

        // Générer le QR code
        const serverUrl = getBackendUrl() || 'http://127.0.0.1:3000';
        const qrData: QuickConnectData = {
          code: response.data.code,
          secret: response.data.secret,
          serverUrl,
        };

        try {
          const qrUrl = await generateQRCode(qrData);
          setQrCodeUrl(qrUrl);
        } catch (qrError) {
          console.warn('[QUICK-CONNECT] Erreur lors de la génération du QR code:', qrError);
          // Continuer sans QR code, l'utilisateur peut entrer le code manuellement
        }

        // Démarrer le polling pour vérifier l'état
        startPolling(response.data.secret);
      }
    } catch (err) {
      setError('Erreur lors de l\'initialisation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (secretToPoll: string) => {
    // Nettoyer l'intervalle précédent si existant
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
    }

    // Polling toutes les 2 secondes
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await serverApi.getQuickConnectStatus(secretToPoll);

        if (statusResponse.success && statusResponse.data) {
          const newStatus = statusResponse.data.status;
          setStatus(newStatus);

          if (newStatus === 'authorized') {
            // Arrêter le polling
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            // Se connecter automatiquement
            await connectQuickConnect(secretToPoll);
          } else if (newStatus === 'expired' || newStatus === 'used') {
            // Arrêter le polling
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            if (newStatus === 'expired') {
              setError('Le code de connexion rapide a expiré. Veuillez générer un nouveau code.');
            }
          }
        }
      } catch (err) {
        console.error('[QUICK-CONNECT] Erreur lors du polling:', err);
      }
    }, 2000);
  };

  const connectQuickConnect = async (secretToConnect: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);

      if (!response.success) {
        setError(response.message || 'Erreur lors de la connexion');
        setLoading(false);
        return;
      }

      // Après connexion rapide : récupérer la config cloud comme après login (AuthStep)
      const cloudToken = response.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
      if (cloudToken) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 200));
          const savedConfig = await getUserConfig();
          const hasSomething =
            !!(savedConfig?.indexers?.length) ||
            !!savedConfig?.tmdbApiKey ||
            !!savedConfig?.downloadLocation ||
            !!savedConfig?.syncSettings ||
            !!savedConfig?.language ||
            !!(savedConfig?.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0);
          if (savedConfig && hasSomething) {
            const missingCategories = !savedConfig.indexerCategories || Object.keys(savedConfig.indexerCategories).length === 0;
            if (missingCategories) {
              syncIndexersToCloud().catch((syncErr) => {
                console.warn('[QUICK-CONNECT] Sync catégories vers le cloud ignorée:', syncErr);
              });
            }
            CloudImportManager.startImport(savedConfig).finally(() => {
              Promise.resolve(onStatusChange?.()).catch(() => {});
            });
          }
        } catch (configError) {
          console.warn('[QUICK-CONNECT] Impossible de récupérer la configuration cloud:', configError);
        }
      }

      if (onStatusChange) {
        await onStatusChange();
      }
      onNext();
    } catch (err) {
      setError('Erreur lors de la connexion');
      console.error(err);
      setLoading(false);
    }
  };

  const handleManualConnect = async () => {
    if (!secret) {
      setError('Aucun secret disponible');
      return;
    }

    await connectQuickConnect(secret);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Connexion rapide</h3>
      
      <p className="text-gray-400">
        Scannez le QR code avec un autre appareil déjà connecté, ou entrez le code manuellement.
      </p>

      {error && (
        <div className="bg-primary-900/30 border border-primary-700 rounded-lg p-4 text-primary-300">
          <span>{error}</span>
        </div>
      )}

      {loading && !code && (
        <div className="flex justify-center items-center min-h-[400px]">
          <span className="loading loading-spinner loading-lg text-white"></span>
        </div>
      )}

      {code && (
        <div className="space-y-6">
          {/* QR Code */}
          {qrCodeUrl && (
            <div className="flex flex-col items-center space-y-4">
              <div className="bg-white p-4 rounded-lg">
                <img src={qrCodeUrl} alt="QR Code de connexion rapide" className="w-64 h-64" />
              </div>
              <p className="text-gray-400 text-sm text-center">
                Scannez ce QR code avec un appareil déjà connecté
              </p>
            </div>
          )}

          {/* Code à 6 caractères */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <div className="text-center space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">
                  Code de connexion rapide
                </label>
                <div className="text-4xl font-mono font-bold text-white tracking-widest mb-2">
                  {code}
                </div>
                <p className="text-gray-400 text-sm">
                  Entrez ce code sur un appareil déjà connecté pour autoriser cette connexion
                </p>
              </div>

              {expiresAt && (
                <div className="text-gray-500 text-xs">
                  Expire dans {Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))} secondes
                </div>
              )}

              {status === 'pending' && (
                <div className="flex items-center justify-center gap-2 text-blue-400">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>En attente d'autorisation...</span>
                </div>
              )}

              {status === 'authorized' && (
                <div className="text-green-400">
                  ✓ Code autorisé, connexion en cours...
                </div>
              )}
            </div>
          </div>

          {/* Bouton de connexion manuelle (fallback) */}
          <div className="flex justify-center">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              onClick={handleManualConnect}
              disabled={loading || status !== 'authorized'}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Connexion...
                </>
              ) : status === 'authorized' ? (
                'Se connecter maintenant'
              ) : (
                'En attente d\'autorisation...'
              )}
            </button>
          </div>

          {/* Bouton pour générer un nouveau code */}
          <div className="flex justify-center">
            <button
              onClick={() => {
                if (pollingIntervalRef.current !== null) {
                  clearInterval(pollingIntervalRef.current);
                  pollingIntervalRef.current = null;
                }
                setCode(null);
                setSecret(null);
                setQrCodeUrl(null);
                setStatus('pending');
                initQuickConnect();
              }}
              disabled={loading}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Générer un nouveau code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
