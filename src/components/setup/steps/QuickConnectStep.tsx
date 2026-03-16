import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { TokenManager } from '../../../lib/client/storage';
import { getUserConfig, getPopcornWebBaseUrl } from '../../../lib/api/popcorn-web';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import { syncIndexersToCloud } from '../../../lib/utils/cloud-sync';
import { generateQRCode } from '../../../lib/utils/qrcode';

interface QuickConnectStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
  /** Mode compact pour l’étape Connexion (desktop) : QR plus petit, moins d’espace, sans scroll */
  compact?: boolean;
  /** Mode TV : grand QR, gros texte, boutons larges pour télécommande et lecture à distance */
  tvMode?: boolean;
}

export function QuickConnectStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange, compact = false, tvMode = false }: QuickConnectStepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  // Mise à jour du compte à rebours chaque seconde
  useEffect(() => {
    if (!expiresAt || status !== 'pending') {
      setRemainingSeconds(null);
      return;
    }
    const update = () => {
      const diffMs = expiresAt - Date.now();
      setRemainingSeconds(Math.max(0, Math.floor(diffMs / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, status]);

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

        // QR code = URL popcorn.app/quick-connect?code=XXX pour redirection au scan (comme ServerUrlStep)
        const quickConnectUrl = `${getPopcornWebBaseUrl()}/quick-connect?code=${response.data.code}`;
        try {
          const qrUrl = await generateQRCode(quickConnectUrl);
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

  const spacing = tvMode ? 'space-y-4' : compact ? 'space-y-3' : 'space-y-6';
  // En TV mode, le QR doit tenir dans la hauteur disponible (viewport 720p - chrome)
  const qrSize = tvMode ? 200 : compact ? 136 : 224;
  const qrPadding = tvMode ? 12 : compact ? 8 : 16;

  return (
    <div className={`quick-connect-step ${tvMode ? 'quick-connect-step--tv' : ''} ${spacing}`}>
      {!compact && !tvMode && (
        <>
          <h3 className="text-2xl font-bold text-white">Connexion rapide</h3>
          <p className="text-gray-400">
            Scannez le QR code avec un autre appareil déjà connecté, ou entrez le code manuellement.
          </p>
        </>
      )}

      {tvMode && (
        <p className="text-center text-gray-300 text-lg" style={{ marginBottom: 4 }}>
          Scannez le QR code avec votre téléphone ou entrez le code sur popcorn-web
        </p>
      )}

      {error && (
        <div className={`bg-primary-900/30 border border-primary-700 rounded-xl text-primary-300 ${tvMode ? 'p-4 text-base' : 'p-3 text-sm'}`}>
          <span>{error}</span>
        </div>
      )}

      {loading && !code && (
        <div className={`flex justify-center items-center ${tvMode ? 'min-h-[320px]' : compact ? 'min-h-[180px]' : 'min-h-[400px]'}`}>
          <span className={`loading loading-spinner text-white ${tvMode ? 'loading-lg' : 'loading-lg'}`}></span>
        </div>
      )}

      {code && (
        <div className={spacing}>
          {/* QR Code — TV: grand pour lecture à distance, compact: petit, défaut: moyen */}
          {qrCodeUrl && (
            <div className="flex flex-col items-center" style={{ maxWidth: '100%' }}>
              <div
                className="bg-white rounded-xl flex items-center justify-center shadow-2xl flex-shrink-0"
                style={{
                  padding: qrPadding,
                  width: qrSize + qrPadding * 2,
                  height: qrSize + qrPadding * 2,
                  maxWidth: '90vw',
                  maxHeight: tvMode ? '30vh' : undefined,
                  boxSizing: 'border-box',
                }}
              >
                <img
                  src={qrCodeUrl}
                  alt="QR Code de connexion rapide"
                  className="object-contain"
                  style={{
                    width: '100%',
                    height: '100%',
                    maxWidth: qrSize,
                    maxHeight: qrSize,
                  }}
                />
              </div>
              {!compact && !tvMode && (
                <p className="text-gray-400 text-sm text-center mt-2">
                  Scannez ce QR code avec un appareil déjà connecté
                </p>
              )}
            </div>
          )}

          {/* Code à 6 caractères — TV: très gros pour lisibilité à distance */}
          <div className={`bg-gray-900 border-2 border-gray-600 rounded-xl ${tvMode ? 'p-6' : compact ? 'p-3' : 'p-6'}`}>
            <div className={`text-center ${tvMode ? 'space-y-4' : compact ? 'space-y-2' : 'space-y-4'}`}>
              <div>
                <label className={`block font-semibold text-gray-400 mb-2 ${tvMode ? 'text-lg' : 'text-sm'}`}>
                  Code à 6 caractères
                </label>
                <div
                  className="font-mono font-bold text-white tracking-widest"
                  style={{
                    fontSize: tvMode ? '2.5rem' : compact ? '1.5rem' : '2.25rem',
                    letterSpacing: tvMode ? '0.35em' : undefined,
                  }}
                >
                  {code}
                </div>
                {!compact && !tvMode && (
                  <p className="text-gray-400 text-sm mt-2">
                    Entrez ce code sur un appareil déjà connecté pour autoriser cette connexion
                  </p>
                )}
              </div>

              {expiresAt && remainingSeconds !== null && (
                <div className={tvMode ? 'text-gray-400 text-base' : 'text-gray-500 text-xs'}>
                  Expire dans {remainingSeconds} secondes
                </div>
              )}

              {status === 'authorized' && (
                <div className={tvMode ? 'text-green-400 text-xl font-semibold' : 'text-green-400 text-sm'}>
                  ✓ Code autorisé, connexion en cours...
                </div>
              )}
            </div>
          </div>

          {/* Bouton de connexion manuelle — TV: grande zone focus */}
          <div className="flex justify-center">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              data-focusable
              onClick={handleManualConnect}
              disabled={loading || status !== 'authorized'}
              className={`
                bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-4 focus:ring-primary-500/50
                ${tvMode ? 'px-8 py-4 text-lg min-h-[56px]' : compact ? 'px-4 py-2 text-sm' : 'px-6 py-3'}
              `}
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

          {/* Bouton pour générer un nouveau code — TV: visible et focusable */}
          <div className="flex justify-center">
            <button
              data-focusable
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
              className={`
                rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-primary-500/50
                bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                ${tvMode ? 'px-6 py-3 text-base min-h-[48px]' : 'px-4 py-2 text-sm'}
              `}
            >
              Générer un nouveau code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
