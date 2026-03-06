import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { generateQRCode } from '../../lib/utils/qrcode';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import { useI18n } from '../../lib/i18n/useI18n';

interface QuickConnectDisplayProps {
  /** Callback appelé quand la connexion est autorisée et réussie */
  onConnected?: () => void | Promise<void>;
  /** Callback appelé en cas d'erreur */
  onError?: (error: string) => void;
  /** Taille du QR code (default: 256) */
  qrSize?: number;
  /** Afficher le titre (default: true) */
  showTitle?: boolean;
  /** Titre personnalisé */
  title?: string;
  /** Description personnalisée */
  description?: string;
  /** Classes CSS additionnelles */
  className?: string;
  /** Mode compact pour intégration dans d'autres formulaires */
  compact?: boolean;
}

/**
 * Composant réutilisable pour afficher un QR code QuickConnect
 * et gérer le polling pour la connexion automatique.
 * 
 * Utilisable dans:
 * - Page de login
 * - Wizard de setup
 * - Paramètres
 */
export function QuickConnectDisplay({
  onConnected,
  onError,
  qrSize = 256,
  showTitle = true,
  title,
  description,
  className = '',
  compact = false,
}: QuickConnectDisplayProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const pollingIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialiser la connexion rapide au montage
    initQuickConnect();

    // Nettoyer les intervalles au démontage
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Timer pour afficher le temps restant
  useEffect(() => {
    if (expiresAt) {
      // Mettre à jour immédiatement
      setTimeRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      
      // Mettre à jour toutes les secondes
      timerIntervalRef.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setTimeRemaining(remaining);
        
        if (remaining <= 0) {
          if (timerIntervalRef.current !== null) {
            clearInterval(timerIntervalRef.current);
          }
        }
      }, 1000);
    }
    
    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [expiresAt]);

  const initQuickConnect = async () => {
    setLoading(true);
    setError(null);
    setStatus('pending');

    try {
      const response = await serverApi.initQuickConnect();

      if (!response.success) {
        const errorMsg = response.message || t('settingsPages.quickConnect.initError');
        setError(errorMsg);
        onError?.(errorMsg);
        setLoading(false);
        return;
      }

      if (response.data) {
        setCode(response.data.code);
        setSecret(response.data.secret);
        setExpiresAt(response.data.expiresAt);

        // QR code = URL popcorn-web pour que le scan ouvre la page : connexion (si besoin) puis accepter l'appareil
        const baseUrl = getPopcornWebBaseUrl();
        const quickConnectPageUrl = `${baseUrl}/quick-connect?code=${encodeURIComponent(response.data.code)}`;

        try {
          const qrUrl = await generateQRCode(quickConnectPageUrl);
          setQrCodeUrl(qrUrl);
        } catch (qrError) {
          console.warn('[QuickConnectDisplay] Erreur lors de la génération du QR code:', qrError);
          // Continuer sans QR code, l'utilisateur peut entrer le code manuellement
        }

        // Démarrer le polling pour vérifier l'état
        startPolling(response.data.secret);
      }
    } catch (err) {
      const errorMsg = 'Erreur lors de l\'initialisation';
      setError(errorMsg);
      onError?.(errorMsg);
      console.error('[QuickConnectDisplay]', err);
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
              setError(t('settingsPages.quickConnect.codeExpired'));
            }
          }
        }
      } catch (err) {
        console.error('[QuickConnectDisplay] Erreur lors du polling:', err);
      }
    }, 2000);
  };

  const connectQuickConnect = async (secretToConnect: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);

      if (!response.success) {
        const errorMsg = response.message || t('settingsPages.quickConnect.connectError');
        setError(errorMsg);
        onError?.(errorMsg);
        setLoading(false);
        return;
      }

      // Connexion réussie
      setStatus('used');
      if (onConnected) {
        await onConnected();
      }
    } catch (err) {
      const errorMsg = t('settingsPages.quickConnect.connectError');
      setError(errorMsg);
      onError?.(errorMsg);
      console.error('[QuickConnectDisplay]', err);
      setLoading(false);
    }
  };

  const handleRegenerateCode = () => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setCode(null);
    setSecret(null);
    setQrCodeUrl(null);
    setStatus('pending');
    setError(null);
    initQuickConnect();
  };

  const containerClasses = compact 
    ? `space-y-4 ${className}`
    : `space-y-6 ${className}`;

  return (
    <div className={containerClasses}>
      {showTitle && (
        <>
          <h3 className={compact ? "text-xl font-bold text-white" : "text-2xl font-bold text-white"}>
            {title ?? t('settingsPages.quickConnect.title')}
          </h3>
          <p className="text-gray-400 text-sm">
            {description ?? t('settingsPages.quickConnect.description')}
          </p>
        </>
      )}

      {error && (
        <div 
          className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 cursor-pointer hover:bg-red-900/40 transition-colors"
          onClick={handleRegenerateCode}
        >
          <span>{error}</span>
        </div>
      )}

      {loading && !code && (
        <div className={`flex justify-center items-center ${compact ? 'min-h-[200px]' : 'min-h-[300px]'}`}>
          <span className="loading loading-spinner loading-lg text-primary-500"></span>
        </div>
      )}

      {code && (
        <div className={compact ? "space-y-4" : "space-y-6"}>
          {/* QR Code */}
          {qrCodeUrl && (
            <div className="flex flex-col items-center space-y-3">
              <div className="bg-white p-3 rounded-lg shadow-lg">
                <img 
                  src={qrCodeUrl} 
                  alt={t('settingsPages.quickConnect.qrAlt')}
                  style={{ width: qrSize, height: qrSize }}
                  className="block"
                />
              </div>
              <p className="text-gray-400 text-xs text-center">
                {t('settingsPages.quickConnect.scanHint')}
              </p>
            </div>
          )}

          {/* Code à 6 caractères */}
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
            <div className="text-center space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  {t('settingsPages.quickConnect.codeLabel')}
                </label>
                <div className={`font-mono font-bold text-white tracking-[0.3em] ${compact ? 'text-3xl' : 'text-4xl'}`}>
                  {code}
                </div>
              </div>

              {timeRemaining > 0 && status === 'pending' && (
                <div className="text-gray-500 text-xs">
                  {t('settingsPages.quickConnect.expiresIn')} {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </div>
              )}

              {status === 'pending' && (
                <div className="flex items-center justify-center gap-2 text-blue-400 text-sm">
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>{t('settingsPages.quickConnect.waitingAuth')}</span>
                </div>
              )}

              {status === 'authorized' && (
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>{t('settingsPages.quickConnect.authorized')}</span>
                </div>
              )}

              {status === 'used' && (
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>{t('settingsPages.quickConnect.connectedSuccess')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bouton pour générer un nouveau code */}
          {(status === 'expired' || timeRemaining <= 0) && (
            <div className="flex justify-center">
              <button
                onClick={handleRegenerateCode}
                disabled={loading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Générer un nouveau code
              </button>
            </div>
          )}

          {status === 'pending' && timeRemaining > 0 && (
            <div className="flex justify-center">
              <button
                onClick={handleRegenerateCode}
                disabled={loading}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded transition-colors disabled:opacity-50"
              >
                {t('settingsPages.quickConnect.regenerateCode')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QuickConnectDisplay;
