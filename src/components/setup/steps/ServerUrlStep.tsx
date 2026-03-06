import { useState, useEffect, useRef } from 'preact/hooks';
import { getBackendUrl, hasBackendUrl, setBackendUrl as saveBackendUrl, getConfiguredBackendUrl, isBackendUrlSameAsClientUrl } from '../../../lib/backend-config.js';
import { STORAGE_BACKEND_START_RESULT, type BackendStartResult } from '../../IndexRedirect';
import { serverApi } from '../../../lib/client/server-api';
import { getPopcornWebBaseUrl } from '../../../lib/api/popcorn-web';
import { useI18n } from '../../../lib/i18n';
import { redirectTo } from '../../../lib/utils/navigation.js';
import { shouldDisplayQRCode } from '../../../lib/utils/device-detection';
import QRCode from 'qrcode';

interface ServerUrlStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
  onStatusChange?: () => void | Promise<void>;
}

export type InstallationChoice = 'firstTime' | 'alreadyConfigured' | 'localAccount';

export function ServerUrlStep({ focusedButtonIndex, buttonRefs, onNext, onStatusChange }: ServerUrlStepProps) {
  const { t } = useI18n();
  /** Choix explicite de l'utilisateur : première installation ou déjà configuré ailleurs */
  const [installationChoice, setInstallationChoice] = useState<InstallationChoice | null>(null);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Détection de la plateforme
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [authorizingCode, setAuthorizingCode] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  
  // Résultat du démarrage automatique du backend (Windows/Linux) — pour affichage
  const [backendStartResult, setBackendStartResult] = useState<BackendStartResult | null>(null);

  // Quick Connect state
  const [quickConnectLoading, setQuickConnectLoading] = useState(false);
  const [quickConnectError, setQuickConnectError] = useState<string | null>(null);
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
  const [quickConnectSecret, setQuickConnectSecret] = useState<string | null>(null);
  const [quickConnectQrUrl, setQuickConnectQrUrl] = useState<string | null>(null);
  const [quickConnectStatus, setQuickConnectStatus] = useState<'pending' | 'authorized' | 'used' | 'expired'>('pending');
  const [quickConnectExpiresAt, setQuickConnectExpiresAt] = useState<number | null>(null);
  const [quickConnectRemaining, setQuickConnectRemaining] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const qrCodeContainerRef = useRef<HTMLDivElement>(null);

  // Mise à jour du compteur de secondes restantes (Quick Connect) toutes les secondes
  useEffect(() => {
    if (!quickConnectExpiresAt || quickConnectStatus !== 'pending') {
      setQuickConnectRemaining(null);
      return;
    }
    const updateRemaining = () => {
      const diffMs = quickConnectExpiresAt - Date.now();
      setQuickConnectRemaining(Math.max(0, Math.floor(diffMs / 1000)));
    };
    updateRemaining();
    const id = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(id);
  }, [quickConnectExpiresAt, quickConnectStatus]);

  useEffect(() => {
    const displayQR = shouldDisplayQRCode();
    setIsScannerMode(!displayQR);
    // Préremplir l'URL du backend depuis l'invitation (compte local) si présente dans l'URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlFromInvitation = params.get('backendUrl');
      if (urlFromInvitation && urlFromInvitation.trim()) {
        const trimmed = urlFromInvitation.trim();
        try {
          new URL(trimmed);
          saveBackendUrl(trimmed);
          setBackendUrl(trimmed);
        } catch {
          // URL invalide, ignorer
        }
      }
    }
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).get('backendUrl')) {
      loadBackendUrl();
    } else {
      setLoading(false);
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_BACKEND_START_RESULT);
      if (raw) {
        const parsed = JSON.parse(raw) as BackendStartResult;
        if (parsed.attempted) setBackendStartResult(parsed);
      }
    } catch {
      // ignore
    }
    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
      }
      stopScanner();
    };
  }, []);

  // Démarrer Quick Connect pour tous les devices (TV, Desktop, Mobile) quand "déjà configuré"
  // Le code est affiché ici et saisi sur popcorn-web, pas dans le client
  useEffect(() => {
    if (installationChoice !== 'alreadyConfigured') return;
    initQuickConnect();
  }, [installationChoice]);

  // Centrer le QR code dans la vue au moment où il s'affiche (TV télécommande ou mobile scroll)
  useEffect(() => {
    if (!quickConnectQrUrl) return;
    const el = qrCodeContainerRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 100);
    return () => clearTimeout(t);
  }, [quickConnectQrUrl]);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!hasBackendUrl()) {
        setBackendUrl('');
        return;
      }

      // Utiliser l'URL réellement configurée (localStorage) pour l'affichage du formulaire,
      // et non getBackendUrl() qui peut renvoyer window.location.origin quand le backend
      // est sur un autre domaine (ex. backup.briseteia.me alors que la page est sur popcorn.briseteia.me)
      const configured = getConfiguredBackendUrl()?.trim().replace(/\/$/, '');
      setBackendUrl(configured || getBackendUrl());
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      setBackendUrl('http://127.0.0.1:3000');
    } finally {
      setLoading(false);
    }
  };

  const resetQuickConnect = () => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setQuickConnectCode(null);
    setQuickConnectSecret(null);
    setQuickConnectQrUrl(null);
    setQuickConnectStatus('pending');
    setQuickConnectError(null);
    setQuickConnectExpiresAt(null);
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError(t('wizard.serverUrl.errors.backendRequired'));
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      // Normaliser l'URL
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        setBackendUrl(normalizedUrl);
      }
      
      // Valider l'URL
      try {
        const urlObj = new URL(normalizedUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
        }
        throw e;
      }

      // Tester la connexion
      const testUrl = `${normalizedUrl}/api/client/health`;
      console.log('[ServerUrlStep] Test de connexion à:', testUrl);
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        setSuccess(`✅ Connexion réussie ! Le serveur est accessible.`);
        // Si l'URL backend est identique à l'adresse du client, demander confirmation avant de sauvegarder
        if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(normalizedUrl)) {
          const confirmed = window.confirm(
            t('wizard.serverUrl.sameOriginConfirmMessage')
          );
          if (!confirmed) {
            setTesting(false);
            return;
          }
        }
        saveBackendUrl(normalizedUrl);
      } else {
        setError(`${t('wizard.serverUrl.errors.connectionFailed')} (${response.status})\n\n${t('wizard.serverUrl.errors.connectionFailedDetails')}`);
      }
    } catch (err) {
      let errorMessage = t('wizard.serverUrl.errors.connectionFailed');
      
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}\n\n${t('wizard.serverUrl.errors.connectionFailedDetails')}`;
      } else if (err instanceof Error) {
        // Essayer de rendre le message d'erreur plus compréhensible
        if (err.message.includes('timeout') || err.message.includes('Timeout')) {
          errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}\n\nLe serveur ne répond pas dans le délai imparti. Vérifiez que le serveur est démarré et accessible.`;
        } else if (err.message.includes('network') || err.message.includes('Network')) {
          errorMessage = `${t('wizard.serverUrl.errors.networkError')}\n\n${t('wizard.serverUrl.errors.networkErrorDetails')}`;
        } else {
          errorMessage = `${t('wizard.serverUrl.errors.connectionFailed')}: ${err.message}`;
        }
      }
      
      setError(errorMessage);
      console.error('[ServerUrlStep] Erreur de test:', err);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (!backendUrl.trim()) {
      setError(t('wizard.serverUrl.errors.backendRequired'));
      return;
    }

    try {
      setTesting(true);
      setError(null);

      // Valider et normaliser l'URL
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        setBackendUrl(normalizedUrl);
      }

        try {
          const urlObj = new URL(normalizedUrl);
          if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            setError(t('wizard.serverUrl.errors.invalidProtocol'));
            setTesting(false);
            return;
          }
        } catch (e) {
          if (e instanceof TypeError) {
            setError(t('wizard.serverUrl.errors.invalidUrlFormat'));
            setTesting(false);
            return;
          }
          throw e;
        }
      
      // Si l'URL backend est identique à l'adresse du client (même host + port), demander confirmation
      if (typeof window !== 'undefined' && isBackendUrlSameAsClientUrl(normalizedUrl)) {
        const confirmed = window.confirm(
          t('wizard.serverUrl.sameOriginConfirmMessage')
        );
        if (!confirmed) {
          setTesting(false);
          return;
        }
      }

      saveBackendUrl(normalizedUrl);
      console.log('[ServerUrlStep] URL sauvegardée:', normalizedUrl);

      // Vérifier le statut du backend
      try {
        const setupStatus = await serverApi.getSetupStatus();
        if (setupStatus.success && setupStatus.data) {
          if (setupStatus.data.backendReachable === false) {
            setError(`${t('wizard.serverUrl.errors.backendNotAccessible')}\n\n${t('wizard.serverUrl.errors.backendNotAccessibleDetails')}`);
            setTesting(false);
            return;
          }
        }
      } catch (statusError) {
        console.warn('[ServerUrlStep] Erreur vérification statut:', statusError);
      }

      onNext();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('save') || errorMsg.includes('Save')) {
        setError(t('wizard.serverUrl.errors.saveError'));
      } else {
        setError(`${t('wizard.serverUrl.errors.connectionError')}: ${errorMsg}`);
      }
    } finally {
      setTesting(false);
    }
  };

  // Initialiser Quick Connect via popcorn-web (sans URL backend - sera récupérée depuis le cloud)
  const initQuickConnect = async () => {
    setQuickConnectLoading(true);
    setQuickConnectError(null);

    try {
      // Appeler l'API popcorn-web pour créer un code de connexion rapide
      const response = await serverApi.initQuickConnect();

      if (!response.success) {
        setQuickConnectError(`${t('wizard.serverUrl.errors.quickConnectInitError')}\n\n${t('wizard.serverUrl.errors.quickConnectInitErrorDetails')}`);
        return;
      }

      if (response.data) {
        const { code, secret, expiresAt } = response.data;
        setQuickConnectCode(code);
        setQuickConnectSecret(secret);
        setQuickConnectExpiresAt(expiresAt);

        // Générer le QR code pointant vers popcorn-web (sans URL backend)
        const quickConnectUrl = `${getPopcornWebBaseUrl()}/quick-connect?code=${code}`;
        console.log('[ServerUrlStep] URL Quick Connect:', quickConnectUrl);

        try {
          const qrDataUrl = await QRCode.toDataURL(quickConnectUrl, {
            width: 256,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQuickConnectQrUrl(qrDataUrl);
        } catch (qrError) {
          console.warn('[ServerUrlStep] Erreur génération QR code:', qrError);
        }

        // Démarrer le polling pour vérifier l'autorisation
        startPolling(secret);
      }
    } catch (err) {
      setQuickConnectError(`${t('wizard.serverUrl.errors.quickConnectInitError')}\n\n${t('wizard.serverUrl.errors.quickConnectInitErrorDetails')}`);
      console.error(err);
    } finally {
      setQuickConnectLoading(false);
    }
  };

  // Polling pour vérifier l'état du Quick Connect
  const startPolling = (secretToPoll: string) => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await serverApi.getQuickConnectStatus(secretToPoll);

        if (statusResponse.success && statusResponse.data) {
          const newStatus = statusResponse.data.status;
          setQuickConnectStatus(newStatus);

          if (newStatus === 'authorized') {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            await connectQuickConnect(secretToPoll);
          } else if (newStatus === 'expired' || newStatus === 'used') {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (newStatus === 'expired') {
              setQuickConnectError(`${t('wizard.serverUrl.errors.codeExpired')}\n\n${t('wizard.serverUrl.errors.codeExpiredDetails')}`);
            }
          }
        }
      } catch (err) {
        console.error('[ServerUrlStep] Erreur polling:', err);
      }
    }, 2000);
  };

  // Se connecter via Quick Connect
  const connectQuickConnect = async (secretToConnect: string) => {
    setQuickConnectLoading(true);
    setQuickConnectError(null);

    try {
      const response = await serverApi.connectQuickConnect(secretToConnect);

      if (!response.success) {
        setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
        setQuickConnectLoading(false);
        return;
      }

      // Utiliser uniquement l'URL du backend (serveur API popcorn-server), jamais clientUrl
      if (response.data?.backendUrl) {
        console.log('[ServerUrlStep] URL du backend récupérée depuis le cloud:', response.data.backendUrl);
        saveBackendUrl(response.data.backendUrl);
        setBackendUrl(response.data.backendUrl);
      } else {
        console.warn('[ServerUrlStep] Aucune URL backend dans la réponse');
        setQuickConnectError(`${t('wizard.serverUrl.errors.noBackendUrlInCloud')}\n\n${t('wizard.serverUrl.errors.noBackendUrlInCloudDetails')}`);
        setQuickConnectLoading(false);
        return;
      }

      // Connexion réussie : appeler onNext() sans onStatusChange() pour éviter un re-render
      // du Wizard (étape 1 à nouveau) avant que onNext ait pu rediriger ou passer à l'étape suivante
      onNext();
    } catch (err) {
      setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
      console.error(err);
      setQuickConnectLoading(false);
    }
  };

  // Régénérer le code Quick Connect
  const handleRegenerateQuickConnect = () => {
    resetQuickConnect();
    initQuickConnect();
  };

  // ===== Fonctions pour le mode Scanner (Mobile) =====
  
  // Démarrer le scanner QR
  const startScanner = async () => {
    setShowScanner(true);
    setQuickConnectError(null);
    
    // Attendre que le DOM soit prêt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!scannerRef.current) return;
    
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          console.log('[ServerUrlStep] QR code scanné:', decodedText);
          await stopScanner();
          handleScannedQR(decodedText);
        },
        (errorMessage) => {
          // Erreurs de scan silencieuses (normales quand pas de QR visible)
        }
      );
    } catch (err) {
      console.error('[ServerUrlStep] Erreur démarrage scanner:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('permission') || errorMsg.includes('Permission') || errorMsg.includes('denied')) {
        setQuickConnectError(t('wizard.serverUrl.cameraPermissionError'));
      } else {
        setQuickConnectError(t('wizard.serverUrl.qrScanError'));
      }
      setShowScanner(false);
    }
  };
  
  // Arrêter le scanner QR
  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {
        console.warn('[ServerUrlStep] Erreur arrêt scanner:', err);
      }
    }
    setShowScanner(false);
  };
  
  // Traiter un QR code scanné
  const handleScannedQR = async (qrContent: string) => {
    try {
      // Le QR code contient une URL comme: https://popcorn-web.../quick-connect?code=XXXXXX
      const url = new URL(qrContent);
      const code = url.searchParams.get('code');
      
      if (code && code.length === 6) {
        setManualCode(code);
        await authorizeWithCode(code);
      } else {
        setQuickConnectError(`${t('wizard.serverUrl.errors.qrCodeInvalid')}\n\n${t('wizard.serverUrl.errors.qrCodeInvalidDetails')}`);
      }
    } catch (err) {
      // Ce n'est pas une URL, peut-être juste un code
      if (qrContent.length === 6 && /^[A-Z0-9]+$/.test(qrContent)) {
        setManualCode(qrContent);
        await authorizeWithCode(qrContent);
      } else {
        setQuickConnectError(`${t('wizard.serverUrl.errors.qrCodeInvalid')}\n\n${t('wizard.serverUrl.errors.qrCodeInvalidDetails')}`);
      }
    }
  };
  
  // Autoriser avec un code (scanné ou entré manuellement)
  const authorizeWithCode = async (code: string) => {
    setAuthorizingCode(true);
    setQuickConnectError(null);
    
    try {
      // Appeler l'API pour autoriser le code
      const response = await serverApi.authorizeQuickConnect(code);
      
      if (!response.success) {
        setQuickConnectError(`${t('wizard.serverUrl.errors.codeInvalid')}\n\n${t('wizard.serverUrl.errors.codeInvalidDetails')}`);
        setAuthorizingCode(false);
        return;
      }
      
      // Autorisation réussie, maintenant connectons-nous
      // On doit récupérer le secret associé à ce code pour obtenir les tokens
      if (response.data?.secret) {
        const connectResponse = await serverApi.connectQuickConnect(response.data.secret);
        
        if (!connectResponse.success) {
          setQuickConnectError(`${t('wizard.serverUrl.errors.connectionError')}\n\n${t('wizard.serverUrl.errors.connectionErrorDetails')}`);
          setAuthorizingCode(false);
          return;
        }
        
        // Utiliser uniquement backendUrl (serveur API), jamais clientUrl
        if (connectResponse.data?.backendUrl) {
          console.log('[ServerUrlStep] URL du backend récupérée:', connectResponse.data.backendUrl);
          saveBackendUrl(connectResponse.data.backendUrl);
          setBackendUrl(connectResponse.data.backendUrl);
          // Connexion quick-connect réussie : redirection directe vers le dashboard (tokens déjà sauvegardés par connectQuickConnect)
          setAuthorizingCode(false);
          redirectTo('/dashboard');
          return;
        } else {
          setQuickConnectError(`${t('wizard.serverUrl.errors.noBackendUrlInCloud')}\n\n${t('wizard.serverUrl.errors.noBackendUrlInCloudDetails')}`);
          setAuthorizingCode(false);
        }
      } else {
        setQuickConnectError(t('wizard.serverUrl.errors.secretNotReceived'));
        setAuthorizingCode(false);
      }
    } catch (err) {
      console.error('[ServerUrlStep] Erreur autorisation:', err);
      setQuickConnectError(`${t('wizard.serverUrl.errors.authorizationError')}\n\n${t('wizard.serverUrl.errors.authorizationErrorDetails')}`);
      setAuthorizingCode(false);
    }
  };
  
  // Gérer la soumission du code manuel
  const handleManualCodeSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (code.length === 6) {
      authorizeWithCode(code);
    } else {
      setQuickConnectError(t('wizard.serverUrl.errors.codeWrongLength'));
    }
  };

  // ===== Rendu =====

  // Écran de choix : première installation ou déjà configuré
  if (installationChoice === null) {
    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-white text-center">{t('wizard.serverUrl.connectClientTitle')}</h3>
        <p className="text-gray-400 text-center text-sm sm:text-base mb-6">
          {t('wizard.serverUrl.choiceQuestion')}
        </p>
        <div className="grid gap-4 sm:grid-cols-1 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => {
              setInstallationChoice('firstTime');
              setShowManualConfig(true);
            }}
            className="text-left p-5 rounded-xl border-2 border-primary-600/50 bg-primary-900/20 hover:bg-primary-900/40 hover:border-primary-500 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-600/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-1">{t('wizard.serverUrl.choiceFirstTime')}</h4>
                <p className="text-gray-400 text-sm">{t('wizard.serverUrl.choiceFirstTimeDesc')}</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setInstallationChoice('alreadyConfigured')}
            className="text-left p-5 rounded-xl border-2 border-gray-600/50 bg-white/5 hover:bg-white/10 hover:border-primary-600/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-600/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-1">{t('wizard.serverUrl.choiceAlreadyConfigured')}</h4>
                <p className="text-gray-400 text-sm">{t('wizard.serverUrl.choiceAlreadyConfiguredDesc')}</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setInstallationChoice('localAccount');
              setShowManualConfig(true);
            }}
            className="text-left p-5 rounded-xl border-2 border-gray-600/50 bg-white/5 hover:bg-white/10 hover:border-primary-600/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-600/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white mb-1">{t('wizard.serverUrl.choiceLocalAccount')}</h4>
                <p className="text-gray-400 text-sm">{t('wizard.serverUrl.choiceLocalAccountDesc')}</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Affichage principal (après choix)
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={() => { setInstallationChoice(null); setShowManualConfig(false); resetQuickConnect(); }}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
          title={t('common.back')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-xl font-bold text-white">
          {installationChoice === 'firstTime' && t('wizard.serverUrl.choiceFirstTime')}
          {installationChoice === 'alreadyConfigured' && t('wizard.serverUrl.choiceAlreadyConfigured')}
          {installationChoice === 'localAccount' && t('wizard.serverUrl.choiceLocalAccount')}
        </h3>
      </div>
      
      {/* Mode mobile "première installation" uniquement (déjà configuré = même flux QR+code que TV) */}
      {isScannerMode && !showManualConfig && installationChoice === 'firstTime' && (
        <>
          {/* Message d'accueil clair avec deux options */}
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-primary-900/30 to-primary-800/20 border border-primary-700/50 rounded-xl p-5">
              <h4 className="text-xl font-bold text-white mb-3 text-center">
                {t('wizard.serverUrl.mobileWelcome')}
              </h4>
              <p className="text-gray-300 text-sm text-center mb-4">
                {t('wizard.serverUrl.mobileChoiceIntro')}
              </p>
              
              {/* Option 1 : Rejoindre installation existante */}
              <div className="bg-white/5 rounded-lg p-4 mb-3 border border-primary-600/30">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h5 className="text-white font-semibold mb-1">
                      {t('wizard.serverUrl.mobileJoinExisting')}
                    </h5>
                    <p className="text-gray-400 text-xs">
                      {t('wizard.serverUrl.mobileJoinExistingDesc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Option 2 : Première installation */}
              <div className="bg-white/5 rounded-lg p-4 border border-gray-600/30">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h5 className="text-white font-semibold mb-1">
                      {t('wizard.serverUrl.mobileFirstInstall')}
                    </h5>
                    <p className="text-gray-400 text-xs">
                      {t('wizard.serverUrl.mobileFirstInstallDesc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {quickConnectError && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm space-y-2">
              <div className="font-semibold">{quickConnectError}</div>
              {quickConnectError.includes('caméra') || quickConnectError.includes('permission') ? (
                <div className="text-xs text-red-400 mt-2">
                  <p className="font-medium mb-1">{t('wizard.serverUrl.cameraPermissionError')}</p>
                  <p>{t('wizard.serverUrl.cameraPermissionHelp')}</p>
                </div>
              ) : quickConnectError.includes('QR code') || quickConnectError.includes('scanner') ? (
                <div className="text-xs text-red-400 mt-2">
                  <p className="font-medium mb-1">{t('wizard.serverUrl.qrScanError')}</p>
                  <p>{t('wizard.serverUrl.qrScanErrorHelp')}</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Scanner QR */}
          {showScanner ? (
            <div className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mb-2">
                <p className="text-blue-300 text-xs text-center">
                  {t('wizard.serverUrl.scanQRCodeDesc')}
                </p>
              </div>
              <div 
                id="qr-reader" 
                ref={scannerRef}
                className="w-full max-w-sm mx-auto rounded-lg overflow-hidden border-2 border-primary-600"
              ></div>
              <button
                onClick={stopScanner}
                className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bouton Scanner - Option principale */}
              <div className="space-y-2">
                <button
                  ref={(el) => { buttonRefs.current[0] = el; }}
                  data-focusable
                  onClick={startScanner}
                  disabled={authorizingCode}
                  className="w-full p-6 bg-gradient-to-br from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg"
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                    <span className="text-lg font-bold">{t('wizard.serverUrl.scanQRCode')}</span>
                    <span className="text-sm opacity-90">{t('wizard.serverUrl.mobileJoinExisting')}</span>
                  </div>
                </button>
              </div>

              {/* Séparateur */}
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-700"></div>
                <span className="text-gray-500 text-sm">ou</span>
                <div className="flex-1 h-px bg-gray-700"></div>
              </div>

              {/* Entrer le code manuellement */}
              <div className="space-y-3">
                <label className="block text-sm text-gray-400 text-center font-medium">
                  {t('wizard.serverUrl.enterCodeManually')}
                </label>
                <p className="text-xs text-gray-500 text-center px-2">
                  {t('wizard.serverUrl.enterCodeDesc')}
                </p>
                <input
                  type="text"
                  value={manualCode}
                  onInput={(e) => setManualCode((e.target as HTMLInputElement).value.toUpperCase())}
                  placeholder="XXXXXX"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-2xl font-mono tracking-[0.3em] placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
                  disabled={authorizingCode}
                />
                <button
                  ref={(el) => { buttonRefs.current[1] = el; }}
                  data-focusable
                  onClick={handleManualCodeSubmit}
                  disabled={manualCode.length !== 6 || authorizingCode}
                  className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authorizingCode ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="loading loading-spinner loading-sm"></span>
                      Connexion...
                    </span>
                  ) : (
                    'Valider le code'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bouton Configuration manuelle - Plus visible */}
          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={() => setShowManualConfig(true)}
              className="w-full px-4 py-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg transition-all text-sm font-medium"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t('wizard.serverUrl.manualConfig')}
              </span>
              <p className="text-xs text-gray-500 mt-1">
                {t('wizard.serverUrl.manualConfigDesc')}
              </p>
            </button>
          </div>
        </>
      )}

      {/* ===== Quick Connect (tous devices) : afficher le code + QR, à saisir sur popcorn-web ===== */}
      {installationChoice === 'alreadyConfigured' && !showManualConfig && (
        <>
          {/* Layout TV : zone QR centrée pour que la télécommande ne le pousse pas hors écran */}
          <div className={quickConnectCode && quickConnectQrUrl ? 'flex flex-col min-h-[80vh]' : undefined}>
            <div className="flex-shrink-0 space-y-4">
          {/* Statut backend : pastille dans le header (Windows/Linux/macOS) — démarrer/arrêter/redémarrer au clic */}
          {/* Instructions claires avec étapes numérotées */}
          <div className="bg-gradient-to-br from-primary-900/30 to-primary-800/20 border border-primary-700/50 rounded-xl p-5 space-y-4">
            <h4 className="text-xl font-bold text-white text-center mb-3">
              {t('wizard.serverUrl.tvInstructionsTitle')}
            </h4>
            
            {/* Étapes numérotées */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  1
                </div>
                <p className="text-gray-300 text-sm flex-1 pt-1">
                  {t('wizard.serverUrl.tvStep1')}
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  2
                </div>
                <p className="text-gray-300 text-sm flex-1 pt-1">
                  {t('wizard.serverUrl.tvStep2')}
                </p>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  3
                </div>
                <p className="text-gray-300 text-sm flex-1 pt-1">
                  {t('wizard.serverUrl.tvStep3')}
                </p>
              </div>
            </div>
            
            {/* Clarification : le QR permet aussi de faire la première config depuis le téléphone */}
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mt-3">
              <p className="text-blue-200 text-xs text-center">
                {t('wizard.serverUrl.tvQrAlsoSetupFromPhone')}
              </p>
            </div>
            
            {/* Icône visuelle montrant le processus */}
            <div className="flex items-center justify-center gap-2 pt-2">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-500">TV</p>
              </div>
              <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto text-primary-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h2m10 0a2 2 0 100-4 2 2 0 000 4zm-8 0a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
                <p className="text-xs text-primary-400">QR Code</p>
              </div>
              <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto text-primary-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-primary-400">Téléphone</p>
              </div>
            </div>
          </div>

          {quickConnectError && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
              <span>{quickConnectError}</span>
              <button
                type="button"
                onClick={handleRegenerateQuickConnect}
                className="ml-2 underline hover:no-underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {quickConnectLoading && !quickConnectCode && (
            <div className="flex justify-center items-center py-12">
              <span className="loading loading-spinner loading-lg text-white"></span>
            </div>
          )}
            </div>

          {quickConnectCode && (
            <>
              {/* Zone centrale dédiée au QR : flex-1 pour occuper l'espace et garder le QR au centre à l'écran */}
              {quickConnectQrUrl && (
                <div
                  ref={qrCodeContainerRef}
                  id="wizard-qr-code-tv"
                  className="flex flex-1 flex-col items-center justify-center min-h-[280px] py-6"
                >
                  <div className="flex flex-col items-center space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-2xl border-4 border-primary-500">
                      <img 
                        src={quickConnectQrUrl} 
                        alt="QR Code de connexion" 
                        className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96" 
                      />
                    </div>
                    <p className="text-gray-400 text-sm text-center max-w-md">
                      {t('wizard.serverUrl.tvStep3')}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex-shrink-0 space-y-4">
              {/* Code à 6 caractères - Mieux mis en avant */}
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-primary-600/50 rounded-xl p-6 shadow-lg">
                <div className="text-center space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-3 font-medium">
                      {t('wizard.serverUrl.tvOrEnterCode')}
                    </label>
                    <div className="bg-black/50 rounded-lg p-4 border-2 border-primary-500 overflow-hidden">
                      <div className="text-3xl xs:text-4xl sm:text-5xl md:text-6xl font-mono font-bold text-white tracking-[0.15em] sm:tracking-[0.25em] md:tracking-[0.3em] mb-2 text-center min-w-0 overflow-x-auto py-1">
                        {quickConnectCode}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      {t('wizard.serverUrl.tvStep4')}
                    </p>
                    {/* Bouton : ouvrir popcorn-web avec le code dans l’URL (comme le QR) */}
                    <a
                      href={`${getPopcornWebBaseUrl()}/quick-connect?code=${quickConnectCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto mt-4 px-5 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {t('wizard.serverUrl.openPopcornWebToAuthorize')}
                    </a>
                  </div>

                  {/* Compteur de temps restant - Plus visible */}
                  {quickConnectExpiresAt && quickConnectStatus === 'pending' && (
                    <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-yellow-300 font-semibold">
                          {t('wizard.serverUrl.tvExpiresIn')} {quickConnectRemaining ?? 0} {t('wizard.serverUrl.tvSeconds')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Statut d'autorisation - Plus visible */}
                  {quickConnectStatus === 'pending' && (
                    <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-center gap-3">
                        <span className="loading loading-spinner loading-md text-blue-400"></span>
                        <span className="text-blue-300 font-medium text-base">
                          {t('wizard.serverUrl.tvWaitingAuth')}
                        </span>
                      </div>
                    </div>
                  )}

                  {quickConnectStatus === 'authorized' && (
                    <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-center gap-3">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-green-300 font-semibold text-base">
                          {t('wizard.serverUrl.tvAuthorized')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bouton régénérer */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleRegenerateQuickConnect}
                  disabled={quickConnectLoading}
                  className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition-colors disabled:opacity-50"
                >
                  Générer un nouveau code
                </button>
              </div>
              </div>
            </>
          )}

          {/* Bouton Configuration manuelle - Plus visible sur TV/Desktop aussi */}
          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={() => setShowManualConfig(true)}
              className="w-full px-4 py-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg transition-all text-sm font-medium"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t('wizard.serverUrl.manualConfig')}
              </span>
              <p className="text-xs text-gray-500 mt-1">
                {t('wizard.serverUrl.manualConfigDesc')}
              </p>
            </button>
          </div>
          </div>
        </>
      )}

      {/* Section Configuration manuelle */}
      {showManualConfig && (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (installationChoice === 'localAccount') {
                  setInstallationChoice(null);
                  setShowManualConfig(false);
                } else {
                  setShowManualConfig(false);
                }
              }}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
              title={installationChoice === 'localAccount' ? t('common.back') : t('wizard.serverUrl.backToQrOrCode')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-gray-400 text-sm">
              Entrez l'URL de votre serveur Popcorn
            </p>
          </div>

          {/* Statut backend : voir la pastille dans le header (démarrer/arrêter/redémarrer) */}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 whitespace-pre-line text-sm space-y-2">
              <div className="font-semibold">{error.split('\n\n')[0]}</div>
              {error.includes('\n\n') && (
                <div className="text-red-400 text-xs mt-2">
                  {error.split('\n\n').slice(1).join('\n\n')}
                </div>
              )}
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300 text-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">{success}</span>
              </div>
            </div>
          )}

          {/* Formulaire URL */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              URL du Backend
            </label>
            <input
              type="url"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="http://192.168.1.100:3000"
              value={backendUrl}
              onInput={(e) => {
                setBackendUrl((e.target as HTMLInputElement).value);
                setError(null);
                setSuccess(null);
              }}
              disabled={testing || loading}
            />
            <p className="text-xs text-gray-500">
              Ex: <code className="bg-gray-800 px-1 rounded">http://192.168.1.100:3000</code>
            </p>
          </div>

          {/* Boutons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              ref={(el) => { buttonRefs.current[0] = el; }}
              data-focusable
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={handleTest}
              disabled={testing || loading || !backendUrl.trim()}
            >
              {testing ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Test...
                </>
              ) : (
                'Tester'
              )}
            </button>
            <button
              ref={(el) => { buttonRefs.current[1] = el; }}
              data-focusable
              className="w-full sm:flex-1 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={handleNext}
              disabled={testing || loading || !backendUrl.trim() || !success}
            >
              {t('common.next')} →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
